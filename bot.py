import os
import random
import time
import threading
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

TOKEN = '8656307750:AAHb9DD6G_Q60GVEAw-8k6hM9SgPSQWNKlY'
TELEGRAM_API_URL = f"https://api.telegram.org/bot{TOKEN}"
ADMIN_ID = 1088785278

TICKET_PRICE = 100
BANK_INFO = "🏦 **የባንክ አካውንት መረጃ**\nአካውንት ቁጥር: `1000324406461`\nስም: Birhanu"

round_participants = {}  # {user_id: [num1, num2, num3]}
taken_numbers = {}        # {num: user_id}
all_users = set()        # ቦቱን ያነጋገሩ ተጠቃሚዎች መታወቂያ

# የክፍያ ማረጋገጫዎች (Pending Approvals)
pending_payments = {}    # { (user_id, num): True }

PRIZES = {
    1: "🔥 400 ብር (1ኛ ደረጃ)",
    2: "⭐ 250 ብር (2ኛ ደረጃ)",
    3: "🎖 150 ብር (3ኛ ደረጃ)",
}

@app.route('/')
def home():
    return "🔥 Enhanced Animated Lottery Bot is running successfully!", 200

@app.route(f"/{TOKEN}", methods=["POST"])
def webhook():
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({"status": "error", "message": "No JSON data received"}), 400
        
        if "message" in data:
            chat_id = data["message"]["chat"]["id"]
            user_text = data["message"].get("text", "").strip()
            user_id = data["message"]["from"]["id"]
            first_name = data["message"]["from"].get("first_name", "ተሳታፊ")

            all_users.add(chat_id)

            if user_text in ["/start", "🔄 አዲስ ዙር / ጨዋታ"]:
                send_main_menu(chat_id, first_name)

            elif user_text in ["🎟 ቁጥር ለመምረጥ (BUY)", "/buy"]:
                show_number_selection(chat_id, user_id)

            elif user_text in ["/draw", "🎲 ዕጣ ማውጣት (DRAW)"]:
                if user_id != ADMIN_ID:
                    send_message(chat_id, "❌ ይህንን ትዕዛዝ መጠቀም የሚችሉት አድሚኑ ብቻ ናቸው!")
                    return jsonify({"status": "unauthorized"}), 403
                
                if not taken_numbers:
                    send_message(chat_id, "⚠️ እስካሁን የተያዘ አንድም ቁጥር የለም!")
                    return jsonify({"status": "no_numbers"}), 200
                
                threading.Thread(target=trigger_manual_draw, args=(chat_id,)).start()

        elif "callback_query" in data:
            callback = data["callback_query"]
            callback_data = callback["data"]
            chat_id = callback["message"]["chat"]["id"]
            message_id = callback["message"]["message_id"]
            user_id = callback["from"]["id"]
            first_name = callback["from"].get("first_name", "ተሳታፊ")

            if callback_data.startswith("select_"):
                num = int(callback_data.split("_")[1])

                if num in taken_numbers:
                    answer_callback(callback["id"], "❌ ይህ ቁጥር ቀድሞ ተይዟል!", show_alert=True)
                    return jsonify({"status": "taken"}), 200

                user_nums = round_participants.get(user_id, [])
                if len(user_nums) >= 3:
                    answer_callback(callback["id"], "⚠️ ከፍተኛው የ 3 ቲኬት ገደብዎ ደርሰዋል!", show_alert=True)
                    return jsonify({"status": "limit"}), 200

                edit_message_keyboard(chat_id, message_id, "⏳ ቁጥሩ በመረጣ ላይ ነው... 🔄", {"inline_keyboard": []})
                time.sleep(0.5)

                reply_text = (
                    f"✨ የመረጡት ዕድለኛ ቁጥር: **{num}** 🎟\n"
                    f"💵 መክፈል የሚኖርብዎት: **{TICKET_PRICE} ብር**\n\n"
                    f"{BANK_INFO}\n\n"
                    f"👇 ክፍያውን ከፈጸሙ በኋላ ከታች ያለውን ቁልፍ በመጫን ማረጋገጫ ይላኩ!"
                )
                confirm_keyboard = {
                    "inline_keyboard": [
                        [{"text": "✅ ክፍያ ፈጽሜአለሁ (አረጋግጥ)", "callback_data": f"paid_{user_id}_{num}"}],
                        [{"text": "🔙 ወደ ቁጥሮች ዝርዝር ተመለስ", "callback_data": "back_to_numbers"}]
                    ]
                }
                edit_message_keyboard(chat_id, message_id, reply_text, confirm_keyboard)

            elif callback_data == "back_to_numbers":
                show_number_selection_inline(chat_id, message_id, user_id)

            elif callback_data.startswith("paid_"):
                parts = callback_data.split("_")
                p_user_id = int(parts[1])
                p_num = int(parts[2])

                if user_id != p_user_id:
                    answer_callback(callback["id"], "❌ ይህ ድርጊት የተከለከለ ነው!", show_alert=True)
                    return jsonify({"status": "forbidden"}), 200

                pending_payments[(p_user_id, p_num)] = True

                answer_callback(callback["id"], "ክፍያዎ ለአድሚን ተልኳል!")
                edit_message_keyboard(chat_id, message_id, "⏳ **ክፍያዎ በማጣራት ላይ ይገኛል!** አድሚኑ ሲያረጋግጠው ማሳወቂያ ይደርሰዎታል። 🚀", {"inline_keyboard": []})

                admin_text = (
                    f"🔔 **አዲስ የክፍያ ማረጋገጫ ጥያቄ!** 💸\n\n"
                    f"👤 ተሳታፊ: {first_name} (ID: `{p_user_id}`)\n"
                    f"🔢 የጠየቀው ቁጥር: **{p_num}**\n"
                    f"💵 የሚጠበቀው ብር: **{TICKET_PRICE} ብር**\n\n"
                    f"እባክዎ የባንክ ገቢዎን በማየት ከታች ያለውን ይጫኑ፡"
                )
                admin_keyboard = {
                    "inline_keyboard": [
                        [{"text": f"✅ ቁጥር {p_num} አጽድቅ", "callback_data": f"approve_{p_user_id}_{p_num}"}]
                    ]
                }
                send_keyboard_inline(ADMIN_ID, admin_text, admin_keyboard)

            elif callback_data.startswith("approve_"):
                if user_id != ADMIN_ID:
                    answer_callback(callback["id"], "❌ አድሚን ብቻ ናቸው ማጽደቅ የሚችሉት!", show_alert=True)
                    return jsonify({"status": "unauthorized"}), 200

                parts = callback_data.split("_")
                target_user_id = int(parts[1])
                approved_num = int(parts[2])

                if not pending_payments.pop((target_user_id, approved_num), None):
                    answer_callback(callback["id"], "❌ ይህ ክፍያ ትክክለኛ አይደለም ወይም ቀድሞ ተሰርዟል!", show_alert=True)
                    return jsonify({"status": "invalid"}), 200

                if approved_num in taken_numbers:
                    answer_callback(callback["id"], "❌ ይህ ቁጥር ቀድሞ ተይዟል!", show_alert=True)
                    return jsonify({"status": "taken"}), 200

                taken_numbers[approved_num] = target_user_id
                
                if target_user_id not in round_participants:
                    round_participants[target_user_id] = []
                if approved_num not in round_participants[target_user_id]:
                    round_participants[target_user_id].append(approved_num)

                answer_callback(callback["id"], "ቁጥሩ ጸድቋል!")
                edit_message_keyboard(chat_id, message_id, f"✅ **ቁጥር {approved_num} በአድሚን ጸድቋል!** 🎉", {"inline_keyboard": []})

                send_message(target_user_id, f"🎉 **እንኳን ደስ አላችሁ! ቁጥርዎ ({approved_num}) ጸድቆ ተመዝግቧል።** 🎟✨\n📊 የያዟቸው አጠቃላይ ቁጥሮች: {len(round_participants[target_user_id])}/3")

                if len(taken_numbers) >= 10:
                    threading.Thread(target=trigger_full_draw).start()

        return jsonify({"status": "success"}), 200
        
    except Exception as e:
        print(f"Error in webhook: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

def send_main_menu(chat_id, first_name):
    reply_text = (
        f"✨ ሰላም **{first_name}**! ወደ **ዕድል ማዕበል ሎተሪ** በደህና መጡ! 🎟🔥\n\n"
        f"🥇 1ኛ አሸናፊ: **400 ብር**\n"
        f"🥈 2ኛ አሸናፊ: **250 ብር**\n"
        f"🥉 3ኛ አሸናፊ: **150 ብር**\n\n"
        f"👇 ቁጥር ለመምረጥ ከታች ያለውን በተን ይጫኑ፦"
    )
    keyboard = {
        "keyboard": [
            [{"text": "🎟 ቁጥር ለመምረጥ (BUY)"}],
            [{"text": "🎲 ዕጣ ማውጣት (DRAW)"}, {"text": "🔄 አዲስ ዙር / ጨዋታ"}]
        ],
        "resize_keyboard": True
    }
    send_reply_keyboard(chat_id, reply_text, keyboard)

def show_number_selection(chat_id, user_id):
    keyboard_buttons = []
    row = []
    user_nums = round_participants.get(user_id, [])
    for i in range(1, 11):
        if i in taken_numbers:
            btn_text = f"❌ {i} (ተያዟል)"
            callback_val = f"taken_{i}"
        else:
            btn_text = f"🟢 ነፃ ({i})"
            callback_val = f"select_{i}"
            
        row.append({"text": btn_text, "callback_data": callback_val})
        if len(row) == 2:
            keyboard_buttons.append(row)
            row = []
    if row:
        keyboard_buttons.append(row)

    text = (
        f"🎯 **ከ 1 እስከ 10 ያሉ ዕድለኛ ቁጥሮች**\n\n"
        f"📊 የተያዙ: **{len(taken_numbers)}/10**\n"
        f"👤 የእርስዎ የያዟቸው ቁጥሮች: `{len(user_nums)}/3`\n\n"
        f"👇 ከታች ከሚታዩት **🟢 ነፃ** በተኖች ውስጥ የሚፈልጉትን ይጫኑ!"
    )
    send_keyboard_inline(chat_id, text, {"inline_keyboard": keyboard_buttons})

def show_number_selection_inline(chat_id, message_id, user_id):
    keyboard_buttons = []
    row = []
    user_nums = round_participants.get(user_id, [])
    for i in range(1, 11):
        if i in taken_numbers:
            btn_text = f"❌ {i} (ተያዟል)"
            callback_val = f"taken_{i}"
        else:
            btn_text = f"🟢 ነፃ ({i})"
            callback_val = f"select_{i}"
            
        row.append({"text": btn_text, "callback_data": callback_val})
        if len(row) == 2:
            keyboard_buttons.append(row)
            row = []
    if row:
        keyboard_buttons.append(row)

    text = (
        f"🎯 **ከ 1 እስከ 10 ያሉ ዕድለኛ ቁጥሮች**\n\n"
        f"📊 የተያዙ: **{len(taken_numbers)}/10**\n"
        f"👤 የእርስዎ የያዟቸው ቁጥሮች: `{len(user_nums)}/3`\n\n"
        f"👇 ከታች ከሚታዩት **🟢 ነፃ** በተኖች ውስጥ የሚፈልጉትን ይጫኑ!"
    )
    edit_message_keyboard(chat_id, message_id, text, {"inline_keyboard": keyboard_buttons})

def get_numbers_keyboard():
    keyboard_buttons = []
    row = []
    for i in range(1, 11):
        if i in taken_numbers:
            btn_text = f"❌ {i} (ተያዟል)"
            callback_val = f"taken_{i}"
        else:
            btn_text = f"🟢 ነፃ ({i})"
            callback_val = f"select_{i}"
            
        row.append({"text": btn_text, "callback_data": callback_val})
        if len(row) == 2:
            keyboard_buttons.append(row)
            row = []
    if row:
        keyboard_buttons.append(row)
    return {"inline_keyboard": keyboard_buttons}

def safe_send_keyboard(chat_id, text, markup):
    url = f"{TELEGRAM_API_URL}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "reply_markup": markup, "parse_mode": "Markdown"}
    response = requests.post(url, json=payload)
    if response.status_code == 403 or "Forbidden" in response.text:
        if chat_id in all_users:
            all_users.remove(chat_id)

def trigger_full_draw():
    all_tickets_flat = []
    for u_id, nums in round_participants.items():
        for n in nums:
            all_tickets_flat.append((u_id, n))

    if not all_tickets_flat:
        return

    winning_tickets = random.sample(all_tickets_flat, min(3, len(all_tickets_flat)))

    winners_text = "🎲 **ዕጣው በመሰንጠቅ ላይ ነው... ⏳**\n\n"
    for chat_id in list(all_users):
        try:
            requests.post(f"{TELEGRAM_API_URL}/sendMessage", json={"chat_id": chat_id, "text": winners_text})
            time.sleep(0.3)
        except:
            pass

    final_winners_text = "👑🥁 **ታላቁ የዕድል ማዕበል ሎተሪ 1ኛ፣ 2ኛ እና 3ኛ አሸናፊዎች ይፋ ሆነዋል!** 🥳🎉\n\n"
    
    for idx, (w_id, w_num) in enumerate(winning_tickets, start=1):
        prize = PRIZES.get(idx, "🎁 ሽልማት")
        final_winners_text += f"🏆 **{idx}ኛ ዕጣ (ቁጥር {w_num}):** — {prize}\n"
        try:
            send_message(w_id, f"🎊 **እንኳን ደስ አላችሁ! በያዙት ቁጥር ({w_num}) {idx}ኛውን ደረጃ ({prize}) አሸንፈዋል!** 🌟🔥")
        except:
            pass

    final_winners_text += (
        "\n👏 **ለአሸናፊዎቻችን ትልቅ ደስታን እንመኛለን!** 🥂\n"
        "🚀 **አዲሱ የ 10 ቁጥሮች ዙር በይፋ ተከፍቷል! ከታች የሚፈልጉትን ቁጥር ይምረጡ።** 👇"
    )

    round_participants.clear()
    taken_numbers.clear()
    pending_payments.clear()
    numbers_markup = get_numbers_keyboard()

    for chat_id in list(all_users):
        safe_send_keyboard(chat_id, final_winners_text, numbers_markup)

def trigger_manual_draw(admin_chat_id):
    all_tickets_flat = []
    for u_id, nums in round_participants.items():
        for n in nums:
            all_tickets_flat.append((u_id, n))

    if not all_tickets_flat:
        return

    w_id, w_num = random.choice(all_tickets_flat)
    prize = PRIZES[3]

    winners_text = (
        "👑🥁 **የዕጣ ማውጫ ማሽን ተሽከረከረ... አሸናፊ ይፋ ሆነዋል!** 🥳🎉\n\n"
        f"🎖 **ዕጣ (ቁጥር {w_num}):** — {prize}\n\n"
        "👏 **ለአሸናፊያችን ትልቅ ደስታን እንመኛለን!** 🥂\n"
        "🚀 **አዲሱ ዙር በይፋ ተከፍቷል! ከታች የሚፈልጉትን ቁጥር ይምረጡ።** 👇"
    )

    try:
        send_message(w_id, f"🎊 **እንኳን ደስ አላችሁ! በያዙት ቁጥር ({w_num}) የተገኘውን ሽልማት ({prize}) አሸንፈዋል!** 🌟🔥")
    except:
        pass

    round_participants.clear()
    taken_numbers.clear()
    pending_payments.clear()
    numbers_markup = get_numbers_keyboard()

    for chat_id in list(all_users):
        safe_send_keyboard(chat_id, winners_text, numbers_markup)

def background_reminder_loop():
    while True:
        time.sleep(840)  # 14 ደቂቃ
        if all_users:
            taken_list = sorted(list(taken_numbers.keys()))
            available_list = sorted([i for i in range(1, 11) if i not in taken_numbers])
            
            taken_str = ", ".join(map(str, taken_list)) if taken_list else "የለም"
            available_str = ", ".join(map(str, available_list)) if available_list else "የለም"

            reminder_text = (
                "🚨 **የዕድል ማዕበል ፈጣን ማስታወሻ!** ⚡️🎟\n\n"
                f"📊 ሁኔታ: **{len(taken_numbers)}/10** ቁጥሮች ተይዘዋል!\n\n"
                f"🔴 **የተያዙ:** `{taken_str}`\n"
                f"🟢 **ነፃ ቁጥሮች:** `{available_str}`\n\n"
                "🔥 ከታች ያሉትን በተኖች በመጫን አሁኑኑ ዕድልዎን ይሞክሩ! 💰✨"
            )
            numbers_markup = get_numbers_keyboard()
            for chat_id in list(all_users):
                safe_send_keyboard(chat_id, reminder_text, numbers_markup)

threading.Thread(target=background_reminder_loop, daemon=True).start()

def send_message(chat_id, text):
    url = f"{TELEGRAM_API_URL}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
    requests.post(url, json=payload)

def send_reply_keyboard(chat_id, text, reply_markup):
    url = f"{TELEGRAM_API_URL}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "reply_markup": reply_markup, "parse_mode": "Markdown"}
    requests.post(url, json=payload)

def send_keyboard_inline(chat_id, text, reply_markup):
    url = f"{TELEGRAM_API_URL}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "reply_markup": reply_markup, "parse_mode": "Markdown"}
    requests.post(url, json=payload)

def edit_message_keyboard(chat_id, message_id, text, reply_markup):
    url = f"{TELEGRAM_API_URL}/editMessageText"
    payload = {"chat_id": chat_id, "message_id": message_id, "text": text, "reply_markup": reply_markup, "parse_mode": "Markdown"}
    requests.post(url, json=payload)

def answer_callback(callback_query_id, text, show_alert=False):
    url = f"{TELEGRAM_API_URL}/answerCallbackQuery"
    payload = {"callback_query_id": callback_query_id, "text": text, "show_alert": show_alert}
    requests.post(url, json=payload)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
