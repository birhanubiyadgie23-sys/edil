import os
import random
import time
import threading
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

# የቦት ቶከን እና አድሚን ID
TOKEN = '8656307750:AAHb9DD6G_Q60GVEAw-8k6hM9SgPSQWNKlY'
TELEGRAM_API_URL = f"https://api.telegram.org/bot{TOKEN}"

# የአድሚን ቴሌግራም ID
ADMIN_ID = 1088785278

# የቲኬት ዋጋ እና የባንክ መረጃ
TICKET_PRICE = 300 
BANK_INFO = "🏦 **የባንክ አካውንት መረጃ**\nአካውንት ቁጥር: `1000324406461`\nስም: Birhanu"

# የዙር መረጃ ማከማቻ (In-memory)
round_participants = {}  # {user_id: {"name": name, "number": chosen_number}}
taken_numbers = set()    # የተያዙ ቁጥሮች (ከ 1 እስከ 10)
user_states = {}         # የተጠቃሚ ስቴት
all_users = set()        # መልእክት የሚላክላቸው ተጠቃሚዎች ሁሉ (ለማስታወሻ)

PRIZES = {
    1: "1000 ብር",
    2: "500 ብር",
    3: "250 ብር",
    4: "175 ብር",
    5: "87.5 ብር"
}

@app.route('/')
def home():
    return "10-Person Lottery Bot with Auto-Reminder is running!", 200

@app.route(f"/{TOKEN}", methods=["POST"])
def webhook():
    try:
        data = request.get_json(force=True)
        
        if "message" in data:
            chat_id = data["message"]["chat"]["id"]
            user_text = data["message"].get("text", "").strip()
            user_id = data["message"]["from"]["id"]
            first_name = data["message"]["from"].get("first_name", "ተጠቃሚ")

            # ተጠቃሚውን መዝገብ ላይ መያዝ (ለማስታወሻ እንዲመች)
            all_users.add(chat_id)

            if user_text == "/start":
                if user_id in user_states:
                    del user_states[user_id]
                    
                reply_text = (
                    f"ሰላም {first_name}! 🎟 ወደ 10 ሰዎች የዕድል ሎተሪ ፕሮግራም እንኳን ደህና መጡ።\n\n"
                    f"• የሚመረጥ ቁጥር: **ከ 1 እስከ 10** (አንድ ቁጥር ለአንድ ሰው)\n"
                    f"• የቲኬት ዋጋ: **{TICKET_PRICE} ብር**\n"
                    f"• አሁን ያሉት ተሳታፊዎች: **{len(round_participants)}/10**\n\n"
                    "**ትዕዛዝ:**\n"
                    "/buy - ቁጥር ለመምረጥ እና ለመሳተፍ"
                )
                send_message(chat_id, reply_text)

            elif user_text == "/buy":
                if len(round_participants) >= 10:
                    send_message(chat_id, "❌ ይቅርታ! የአሁን ዙር 10 ተሳታፊዎች ሞልተዋል። እጣው እስኪወጣ ይጠብቁ።")
                    return

                if user_id in round_participants:
                    send_message(chat_id, f"⚠️ እርስዎ ఇప్పటికే ቁጥር ({round_participants[user_id]['number']}) ይዘዋል! የክፍያ ማረጋገጫ ይጠብቁ።")
                    return

                user_states[user_id] = "waiting_for_number"
                available_nums = [str(i) for i in range(1, 11) if i not in taken_numbers]
                
                send_message(chat_id, f"🎯 እባክዎ ከ 1 እስከ 10 ካሉት **ነፃ ቁጥሮች** ውስጥ የሚፈልጉትን አንድ ቁጥር ጽሁፍ በመጻፍ ላኩልኝ፦\n\nነፃ ቁጥሮች: `{', '.join(available_nums)}`")

            elif user_id in user_states and user_states[user_id] == "waiting_for_number":
                if not user_text.isdigit():
                    send_message(chat_id, "❌ እባክዎ ትክክለኛ ቁጥር (ከ 1 እስከ 10) ብቻ ይጻፉ!")
                    return

                num = int(user_text)
                if num < 1 or num > 10:
                    send_message(chat_id, "❌ ቁጥሩ ከ 1 እስከ 10 መሆን አለበት!")
                    return

                if num in taken_numbers:
                    send_message(chat_id, "❌ ይህ ቁጥር በሌላ ተሳታፊ ተይዟል! ሌላ ቁጥር ይምረጡ።")
                    return

                del user_states[user_id]
                
                reply_text = (
                    f"✅ የመረጡት ቁጥር: **{num}**\n"
                    f"💵 መክፈል የሚኖርብዎት: **{TICKET_PRICE} ብር**\n\n"
                    f"{BANK_INFO}\n\n"
                    "⏳ ክፍያውን ከፈጸሙ በኋላ ከታች ያለውን ቁልፍ በመጫን ማረጋገጫ ይላኩ።"
                )
                confirm_keyboard = {
                    "inline_keyboard": [
                        [{"text": "✅ ክፍያ ፈጽሜአለሁ (አረጋግጥ)", "callback_data": f"paid_{user_id}_{num}"}]
                    ]
                }
                send_keyboard(chat_id, reply_text, confirm_keyboard)

        elif "callback_query" in data:
            callback = data["callback_query"]
            callback_data = callback["data"]
            chat_id = callback["message"]["chat"]["id"]
            user_id = callback["from"]["id"]
            first_name = callback["from"].get("first_name", "ተጠቃሚ")

            if callback_data.startswith("paid_"):
                parts = callback_data.split("_")
                p_user_id = int(parts[1])
                p_num = int(parts[2])

                answer_callback(callback["id"], "ክፍያዎ ለአድሚን ተልኳል!")
                send_message(chat_id, "⏳ **ክፍያዎ ለአድሚን ተልኳል!** አድሚኑ ሲያረጋግጠው ቁጥርዎ ይጸድቃል።")

                admin_text = (
                    f"🔔 **አዲስ የክፍያ ማረጋገጫ (10-Person Lottery)!**\n\n"
                    f"👤 ተሳታፊ: {first_name} (ID: `{p_user_id}`)\n"
                    f"🔢 የመረጠው ቁጥር: **{p_num}**\n"
                    f"💵 የሚጠበቀው ብር: **{TICKET_PRICE} ብር**\n\n"
                    "እባክዎ ባንክዎን በማየት ከታች ያለውን ይጫኑ፡"
                )
                admin_keyboard = {
                    "inline_keyboard": [
                        [{"text": f"✅ ቁጥር {p_num} አጽድቅ", "callback_data": f"approve_{p_user_id}_{p_num}"}]
                    ]
                }
                send_keyboard(ADMIN_ID, admin_text, admin_keyboard)

            elif callback_data.startswith("approve_"):
                if user_id != ADMIN_ID:
                    answer_callback(callback["id"], "❌ አድሚን ብቻ ናቸው ይህንን ማድረግ የሚችሉት!")
                    return

                parts = callback_data.split("_")
                target_user_id = int(parts[1])
                approved_num = int(parts[2])

                if approved_num in taken_numbers:
                    answer_callback(callback["id"], "❌ ይህ ቁጥር უკვე ተይዟል!")
                    return

                taken_numbers.add(approved_num)
                round_participants[target_user_id] = {"name": "ተሳታፊ", "number": approved_num}

                answer_callback(callback["id"], "ቁጥሩ ጸድቋል!")
                edit_message(chat_id, callback["message"]["message_id"], f"✅ **ቁጥር {approved_num} ጸድቋል! (አሁን ያሉት: {len(round_participants)}/10)**")

                send_message(target_user_id, f"🎉 **እንኳን ደስ አላችሁ! ቁጥርዎ ({approved_num}) በድል አድራጊነት ጸድቋል።**\n📊 አጠቃላይ ተሳታፊዎች: {len(round_participants)}/10")

                if len(round_participants) == 10:
                    trigger_automatic_draw()

        return jsonify({"status": "success"}), 200
        
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"status": "error"}), 500

def trigger_automatic_draw():
    participants_list = list(round_participants.items())
    winning_participants = random.sample(participants_list, 5)

    winners_text = "🎉 **የ 10 ሰዎች ዕድል ሎተሪ አሸናፊዎች ይፋ ሆነዋል!** 🎉\n\n"
    
    for idx, (w_id, data) in enumerate(winning_participants, start=1):
        prize = PRIZES[idx]
        winners_text += f"🏆 **{idx}ኛ እጣ (ቁጥር {data['number']}):** — **{prize}**\n"
        send_message(w_id, f"🎊 **እንኳን ደስ አላችሁ! በያዙት ቁጥር ({data['number']}) {idx}ኛውን እጣ ({prize}) አሸንፈዋል!** 🥳")

    winners_text += (
        "\n👏 **ለአሸናፊዎቹ ሁሉ እንኳን ደስ አላችሁ!** 🎊\n"
        "🔄 **አዲሱ የ 10 ሰዎች ዙር በይፋ ተጀምሯል! ቁጥር ለመምረጥ ይጫኑ፦** /buy 🎟"
    )

    for w_id in round_participants.keys():
        send_message(w_id, winners_text)

    round_participants.clear()
    taken_numbers.clear()

# 🔄 ሰርቨሩ እንዳይተኛ እና ተሳታፊዎች እንዲነቃቁ በጀርባ የሚሰራ (Background Reminder Thread)
def background_reminder_loop():
    while True:
        time.sleep(600)  # በየ 10 ደቂቃው (600 ሰከንድ) አንዴ ይጠራል።
        if all_users:
            reminder_text = (
                "📢 **ማስታወሻ ከዕድል ሎተሪ ቦት!**\n\n"
                f"አሁን ያሉት ተሳታፊዎች: **{len(round_participants)}/10**\n"
                "ቦታዎች ከመሞላታቸው በፊት አሁኑኑ /buy በመጫን የሚፈልጉትን ቁጥር ይምረጡ እና ዕድልዎን ይሞክሩ! 🎟✨"
            )
            for chat_id in list(all_users):
                try:
                    send_message(chat_id, reminder_text)
                except Exception as e:
                    print(f"Reminder error for {chat_id}: {e}")

# የባክግራውንድ ቲሬድ ማስጀመር
threading.Thread(target=background_reminder_loop, daemon=True).start()

def send_message(chat_id, text):
    url = f"{TELEGRAM_API_URL}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
    requests.post(url, json=payload)

def send_keyboard(chat_id, text, reply_markup):
    url = f"{TELEGRAM_API_URL}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "reply_markup": reply_markup, "parse_mode": "Markdown"}
    requests.post(url, json=payload)

def edit_message(chat_id, message_id, text):
    url = f"{TELEGRAM_API_URL}/editMessageText"
    payload = {"chat_id": chat_id, "message_id": message_id, "text": text, "parse_mode": "Markdown"}
    requests.post(url, json=payload)

def answer_callback(callback_query_id, text):
    url = f"{TELEGRAM_API_URL}/answerCallbackQuery"
    payload = {"callback_query_id": callback_query_id, "text": text, "show_alert": True}
    requests.post(url, json=payload)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
