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
# round_participants structure: {user_id: [num1, num2, num3]} (አንድ ተጠቃሚ እስከ 3 ቁጥር መያዝ ስለሚችል በሊስት ተይዟል)
round_participants = {}  
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
    return "10-Person Lottery Bot (Max 3 tickets per user) is running!", 200

@app.route(f"/{TOKEN}", methods=["POST"])
def webhook():
    try:
        data = request.get_json(force=True)
        
        if "message" in data:
            chat_id = data["message"]["chat"]["id"]
            user_text = data["message"].get("text", "").strip()
            user_id = data["message"]["from"]["id"]
            first_name = data["message"]["from"].get("first_name", "ተጠቃሚ")

            all_users.add(chat_id)

            if user_text == "/start":
                if user_id in user_states:
                    del user_states[user_id]
                    
                total_taken_count = len(taken_numbers)
                reply_text = (
                    f"ሰላም {first_name}! 🎟 ወደ 10 ሰዎች የዕድል ሎተሪ ፕሮግራም እንኳን ደህና መጡ።\n\n"
                    f"• የሚመረጥ ቁጥር: **ከ 1 እስከ 10**\n"
                    f"• የክፍያ ዋጋ በአንድ ቁጥር: **{TICKET_PRICE} ብር**\n"
                    f"• **ማስታወሻ:** አንድ ተጠቃሚ **እስከ 3 ቲኬት (ቁጥር)** መግዛት ይችላል!\n"
                    f"• አሁን የተያዙ ቲኬቶች: **{total_taken_count}/10**\n\n"
                    "**ትዕዛዝ:**\n"
                    "/buy - ቁጥር ለመምረጥ እና ለመሳተፍ"
                )
                send_message(chat_id, reply_text)

            elif user_text == "/buy":
                if len(taken_numbers) >= 10:
                    send_message(chat_id, "❌ ይቅርታ! አጠቃላይ 10ቱንም ቁጥሮች ተይዘዋል። እጣው እስኪወጣ ይጠብቁ።")
                    return

                # ተጠቃሚው የያዛቸውን ቁጥሮች ብዛት ማረጋገጥ (እስከ 3)
                user_nums = round_participants.get(user_id, [])
                if len(user_nums) >= 3:
                    send_message(chat_id, f"⚠️ እርስዎ ఇప్పటికే ከፍተኛውን የቁጥር ገደብ (**3 ቁጥሮች**) ይዘዋል! የያዟቸው ቁጥሮች: {', '.join(map(str, user_nums))}")
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

                # ድጋሚ እሱ ራሱ የያዘውን ቁጥር እንዳይመርጥ ማረጋገጥ
                user_nums = round_participants.get(user_id, [])
                if num in user_nums:
                    send_message(chat_id, "❌ ይህንን ቁጥር እርስዎ አስቀድመው ይዘውታል! ሌላ ቁጥር ይምረጡ።")
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
                    answer_callback(callback["id"], "❌ ይህ ቁጥር አሁንም ተይዟል!")
                    return

                taken_numbers.add(approved_num)
                
                if target_user_id not in round_participants:
                    round_participants[target_user_id] = []
                if approved_num not in round_participants[target_user_id]:
                    round_participants[target_user_id].append(approved_num)

                answer_callback(callback["id"], "ቁጥሩ ጸድቋል!")
                edit_message(chat_id, callback["message"]["message_id"], f"✅ **ቁጥር {approved_num} ጸድቋል! (አሁን የተያዙ: {len(taken_numbers)}/10)**")

                send_message(target_user_id, f"🎉 **እንኳን ደስ አላችሁ! ቁጥርዎ ({approved_num}) በድል አድራጊነት ጸድቋል።**\n📊 የያዟቸው አጠቃላይ ቁጥሮች: {len(round_participants[target_user_id])}/3")

                # አጠቃላይ 10 ቁጥሮች ሲሞሉ እጣ ማውጣት
                if len(taken_numbers) >= 10:
                    trigger_automatic_draw()

        return jsonify({"status": "success"}), 200
        
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"status": "error"}), 500

def trigger_automatic_draw():
    # እያንዳንዱን የተረጋገጠ ቁጥር እንደየባለቤቱ ለድል ማዘጋጀት
    all_tickets_flat = []
    for u_id, nums in round_participants.items():
        for n in nums:
            all_tickets_flat.append((u_id, n))

    winning_tickets = random.sample(all_tickets_flat, min(5, len(all_tickets_flat)))

    winners_text = "🎉 **የ 10 ሰዎች ዕድል ሎተሪ አሸናፊዎች ይፋ ሆነዋል!** 🎉\n\n"
    
    for idx, (w_id, w_num) in enumerate(winning_tickets, start=1):
        prize = PRIZES[idx]
        winners_text += f"🏆 **{idx}ኛ እጣ (ቁጥር {w_num}):** — **{prize}**\n"
        send_message(w_id, f"🎊 **እንኳን ደስ አላችሁ! በያዙት ቁጥር ({w_num}) {idx}ኛውን እጣ ({prize}) አሸንፈዋል!** 🥳")

    winners_text += (
        "\n👏 **ለአሸናፊዎቹ ሁሉ እንኳን ደስ አላችሁ!** 🎊\n"
        "🔄 **አዲሱ የ 10 ሰዎች ዙር በይፋ ተጀምሯል! ቁጥር ለመምረጥ ይጫኑ፦** /buy 🎟"
    )

    for chat_id in all_users:
        try:
            send_message(chat_id, winners_text)
        except:
            pass

    round_participants.clear()
    taken_numbers.clear()

# 🔄 ሰርቨሩ እንዳይተኛ እና የተያዙ/የቀሩ ቁጥሮችን በሪማይንደር የሚልክ ሎጂክ
def background_reminder_loop():
    while True:
        time.sleep(600)  # በየ 10 ደቂቃው
        if all_users:
            taken_list = sorted(list(taken_numbers))
            available_list = sorted([i for i in range(1, 11) if i not in taken_numbers])
            
            taken_str = ", ".join(map(str, taken_list)) if taken_list else "የለም"
            available_str = ", ".join(map(str, available_list)) if available_list else "የለም"

            reminder_text = (
                "📢 **ማስታወሻ ከዕድል ሎተሪ ቦት!**\n\n"
                f"📊 ሁኔታ: **{len(taken_numbers)}/10** ቁጥሮች ተይዘዋል\n\n"
                f"🔴 **የተያዙ ቁጥሮች:** `{taken_str}`\n"
                f"🟢 **ቀሩ (ነፃ) ቁጥሮች:** `{available_str}`\n\n"
                "ቦታዎች ከመሞላታቸው በፊት አሁኑኑ /buy በመጫን እስከ 3 ቁጥሮች ይምረጡና ዕድልዎን ይሞክሩ! 🎟✨"
            )
            for chat_id in list(all_users):
                try:
                    send_message(chat_id, reminder_text)
                except Exception as e:
                    print(f"Reminder error for {chat_id}: {e}")

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
