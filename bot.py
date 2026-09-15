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
round_participants = {}  # {user_id: [num1, num2, num3]}
taken_numbers = set()    # የተያዙ ቁጥሮች (ከ 1 እስከ 10)
user_states = {}         # የተጠቃሚ ስቴት
all_users = set()        # መልእክት የሚላክላቸው ተጠቃሚዎች ሁሉ

PRIZES = {
    1: "🔥 1,000 ብር (አንደኛ ደረጃ)",
    2: "⭐ 500 ብር (ሁለተኛ ደረጃ)",
    3: "🎖 250 ብር (ሶስተኛ ደረጃ)",
    4: "🏅 175 ብር (አራተኛ ደረጃ)",
    5: "🎁 87.5 ብር (አምስተኛ ደረጃ)"
}

@app.route('/')
def home():
    return "🔥 Exciting 10-Person Lottery Bot is live and running!", 200

@app.route(f"/{TOKEN}", methods=["POST"])
def webhook():
    try:
        data = request.get_json(force=True)
        
        if "message" in data:
            chat_id = data["message"]["chat"]["id"]
            user_text = data["message"].get("text", "").strip()
            user_id = data["message"]["from"]["id"]
            first_name = data["message"]["from"].get("first_name", "ተሳታፊ")

            all_users.add(chat_id)

            if user_text == "/start":
                if user_id in user_states:
                    del user_states[user_id]
                    
                total_taken_count = len(taken_numbers)
                reply_text = (
                    f"✨ ሰላም **{first_name}**! ሉላዊ እና አጓጊ ወደሆነው **የዕድል ማዕበል ሎተሪ** በደህና መጡ! 🎟🔥\n\n"
                    "🎯 **ምን ያህል ማሸነፍ ይችላሉ?**\n"
                    f"🥇 1ኛ አሸናፊ: **1,000 ብር**\n"
                    f"🥈 2ኛ አሸናፊ: **500 ብር**\n"
                    f"🥉 እስከ 5ኛ ደረጃ ያሉትን አስደናቂ ሽልማቶች ይረከቡ!\n\n"
                    f"📌 **ህጎቹ ቀላል ናቸው፦**\n"
                    f"• ቁጥሮች ከ **1 እስከ 10** አሉ።\n"
                    f"• የአንድ ቲኬት ዋጋ: **{TICKET_PRICE} ብር** ብቻ!\n"
                    f"• አንድ ሰው **እስከ 3 ቲኬቶች** በመግዛት ዕድሉን ማሳደግ ይችላል!\n"
                    f"• አሁን የተያዙ ቦታዎች: **{total_taken_count}/10** 🚀\n\n"
                    "👇 ወዲያውኑ ዕድልዎን ለመሞከር ይህንን ይጫኑ፦\n"
                    "/buy - 🎟 ቁጥር ይምረጡ"
                )
                send_message(chat_id, reply_text)

            elif user_text == "/buy":
                if len(taken_numbers) >= 10:
                    send_message(chat_id, "❌ ይቅርታ! የአሁኑ ዙር 10 ቁጥሮች ሙሉ በሙሉ ተይዘዋል። እጣው እስኪወጣ በጉጉት ይጠብቁ! ⏳")
                    return

                user_nums = round_participants.get(user_id, [])
                if len(user_nums) >= 3:
                    send_message(chat_id, f"⚠️ ውድ {first_name}, እርስዎ አስቀድመው ከፍተኛውን የ **3 ቲኬቶች** ገደብ ሞልተዋል! የያዟቸው ቁጥሮች: `{', '.join(map(str, user_nums))}` 🍀 መልካም ዕድል!")
                    return

                user_states[user_id] = "waiting_for_number"
                available_nums = [str(i) for i in range(1, 11) if i not in taken_numbers]
                
                send_message(chat_id, f"🎯 ዕድለኛ ቁጥርዎትን ይምረጡ!\n\nከዚህ በታች ካሉት **ነፃ ቁጥሮች** ውስጥ የሚፈልጉትን አንድ ቁጥር ብቻ ጽሁፍ በመጻፍ ላኩልኝ፦\n\n🟢 **ነፃ ቁጥሮች:** `{', '.join(available_nums)}`")

            elif user_id in user_states and user_states[user_id] == "waiting_for_number":
                if not user_text.isdigit():
                    send_message(chat_id, "❌ እባክዎ ትክክለኛ ቁጥር (ከ 1 እስከ 10 ባለው) ብቻ በቁጥር ይጻፉ!")
                    return

                num = int(user_text)
                if num < 1 or num > 10:
                    send_message(chat_id, "❌ ቁጥሩ ከ 1 እስከ 10 ብቻ መሆን አለበት!")
                    return

                if num in taken_numbers:
                    send_message(chat_id, "❌ oops! ይህ ቁጥር በሌላ ተሳታፊ ተይዟል። እባክዎ ሌላ ነፃ ቁጥር ይምረጡ። ⚡️")
                    return

                user_nums = round_participants.get(user_id, [])
                if num in user_nums:
                    send_message(chat_id, "❌ ይህንን ቁጥር እርስዎ አስቀድመው ይዘውታል! ሌላ አዲስ ቁጥር ይምረጡ።")
                    return

                del user_states[user_id]
                
                reply_text = (
                    f"✨ ድንቅ መረጣ! የመረጡት ዕድለኛ ቁጥር: **{num}** 🎟\n"
                    f"💵 መክፈል የሚኖርብዎት: **{TICKET_PRICE} ብር**\n\n"
                    f"{BANK_INFO}\n\n"
                    "👇 ክፍያውን ከፈጸሙ በኋላ ከታች ያለውን ቁልፍ በመጫን ማረጋገጫ ይላኩ!"
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
            first_name = callback["from"].get("first_name", "ተሳታፊ")

            if callback_data.startswith("paid_"):
                parts = callback_data.split("_")
                p_user_id = int(parts[1])
                p_num = int(parts[2])

                answer_callback(callback["id"], "ክፍያዎ ለአድሚን ተልኳል!")
                send_message(chat_id, "⏳ **ክፍያዎ በማጣራት ላይ ይገኛል!** አድሚኑ ወዲያውኑ አረጋግጦ ቁጥርዎን ያጸድቅለታል። ትንሽ ይቆዩ 🚀")

                admin_text = (
                    f"🔔 **አዲስ የክፍያ ማረጋገጫ ጥያቄ!** 💸\n\n"
                    f"👤 ተሳታፊ: {first_name} (ID: `{p_user_id}`)\n"
                    f"🔢 የጠየቀው ቁጥር: **{p_num}**\n"
                    f"💵 የሚጠበቀው ብር: **{TICKET_PRICE} ብር**\n\n"
                    "እባክዎ የባንክ ገቢዎን በማየት ከታች ያለውን ይጫኑ፡"
                )
                admin_keyboard = {
                    "inline_keyboard": [
                        [{"text": f"✅ ቁጥር {p_num} አጽድቅ", "callback_data": f"approve_{p_user_id}_{p_num}"}]
                    ]
                }
                send_keyboard(ADMIN_ID, admin_text, admin_keyboard)

            elif callback_data.startswith("approve_"):
                if user_id != ADMIN_ID:
                    answer_callback(callback["id"], "❌ ይህንን ማድረግ የሚችሉት አድሚን ብቻ ናቸው!")
                    return

                parts = callback_data.split("_")
                target_user_id = int(parts[1])
                approved_num = int(parts[2])

                if approved_num in taken_numbers:
                    answer_callback(callback["id"], "❌ ይህ ቁጥር უკვე ተይዟል!")
                    return

                taken_numbers.add(approved_num)
                
                if target_user_id not in round_participants:
                    round_participants[target_user_id] = []
                if approved_num not in round_participants[target_user_id]:
                    round_participants[target_user_id].append(approved_num)

                answer_callback(callback["id"], "ቁጥሩ በተሳካ ሁኔታ ጸድቋል!")
                edit_message(chat_id, callback["message"]["message_id"], f"✅ **ቁጥር {approved_num} ጸድቋል! (አሁን የተያዙ: {len(taken_numbers)}/10)** 🎉")

                send_message(target_user_id, f"🎉 **እንኳን ደስ አላችሁ! ቁጥርዎ ({approved_num}) በአድሚን ጸድቆ ተመዝግቧል።** 🎟✨\n📊 የያዟቸው አጠቃላይ ቁጥሮች: {len(round_participants[target_user_id])}/3")

                if len(taken_numbers) >= 10:
                    trigger_automatic_draw()

        return jsonify({"status": "success"}), 200
        
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"status": "error"}), 500

def trigger_automatic_draw():
    all_tickets_flat = []
    for u_id, nums in round_participants.items():
        for n in nums:
            all_tickets_flat.append((u_id, n))

    winning_tickets = random.sample(all_tickets_flat, min(5, len(all_tickets_flat)))

    winners_text = "👑🥁 **ታላቁ የዕድል ማዕበል ሎተሪ አሸናፊዎች ይፋ ሆነዋል!** 🥳🎉\n\n"
    
    for idx, (w_id, w_num) in enumerate(winning_tickets, start=1):
        prize = PRIZES[idx]
        winners_text += f"🏆 **{idx}ኛ ዕጣ (ቁጥር {w_num}):** — {prize}\n"
        send_message(w_id, f"🎊 **ልዩ ሽልማት! በያዙት ቁጥር ({w_num}) {idx}ኛውን ደረጃ ({prize}) አሸንፈዋል!** 🌟🔥")

    winners_text += (
        "\n👏 **ለአሸናፊዎቻችን ትልቅ ደስታን እንመኛለን!** 🥂\n"
        "🚀 **አዲሱ የ 10 ሰዎች ዙር በይፋ ተከፍቷል! አሁኑኑ ቁጥር ለመያዝ ይጫኑ፦** /buy 🎟"
    )

    for chat_id in all_users:
        try:
            send_message(chat_id, winners_text)
        except:
            pass

    round_participants.clear()
    taken_numbers.clear()

# 🔄 ሰርቨሩ እንዳይተኛ እና የተያዙ/የቀሩ ቁጥሮችን በሪማይንደር የሚልክ ሎጂክ (በየ 14 ደቂቃው)
def background_reminder_loop():
    while True:
        time.sleep(840)  # 14 ደቂቃ (ሰርቨሩ ከመተኛቱ በፊት)
        if all_users:
            taken_list = sorted(list(taken_numbers))
            available_list = sorted([i for i in range(1, 11) if i not in taken_numbers])
            
            taken_str = ", ".join(map(str, taken_list)) if taken_list else "የለም"
            available_str = ", ".join(map(str, available_list)) if available_list else "የለም"

            reminder_text = (
                "🚨 **የዕድል ማዕበል ፈጣን ማስታወሻ!** ⚡️🎟\n\n"
                f"📊 የአሁኑ ሁኔታ: **{len(taken_numbers)}/10** ቁጥሮች ተይዘዋል!\n\n"
                f"🔴 **የተያዙ ቁጥሮች:** `{taken_str}`\n"
                f"🟢 **የቀሩ ነፃ ቁጥሮች:** `{available_str}`\n\n"
                "🔥 ቦታዎች ከማለቃቸው በፊት አሁኑኑ /buy በመጫን እስከ 3 ቁጥሮች ይምረጡና ዕድልዎን ያረጋግጡ! 💰✨"
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
