import os
import random
import time
import threading
import telebot
from flask import Flask, request, jsonify

TOKEN = '8656307750:AAHb9DD6G_Q60GVEAw-8k6hM9SgPSQWNKlY'
bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

ADMIN_ID = 1088785278
TICKET_PRICE = 100
BANK_INFO = "🏦 **የባንክ አካውንት መረጃ**\nአካውንት ቁጥር: `1000324406461`\nስም: Birhanu"

round_participants = {}  # {user_id: [num1, num2, num3]}
taken_numbers = {}       # {num: user_id}
all_users = set()        # ቦቱን ያነጋገሩ ተጠቃሚዎች መታወቂያ
pending_payments = {}    # { (user_id, num): True }

PRIZES = {
    1: "🔥 400 ብር (1ኛ ደረጃ)",
    2: "⭐ 250 ብር (2ኛ ደረጃ)",
    3: "🎖 150 ብር (3ኛ ደረጃ)",
}

@app.route('/')
def home():
    return "🔥 Enhanced Animated Lottery Bot is running successfully!", 200

@app.route(f'/{TOKEN}', methods=['POST'])
def webhook():
    try:
        if request.headers.get('content-type') == 'application/json':
            json_string = request.get_data().decode('utf-8')
            update = telebot.types.Update.de_json(json_string)
            bot.process_new_updates([update])
            return "OK", 200
        else:
            return jsonify({"status": "error", "message": "Invalid content-type"}), 403
    except Exception as e:
        print(f"Webhook Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@bot.message_handler(commands=['start'])
def send_start(message):
    chat_id = message.chat.id
    first_name = message.from_user.first_name or "ተሳታፊ"
    all_users.add(chat_id)
    send_main_menu(chat_id, first_name)

@bot.message_handler(func=lambda message: message.text in ["🔄 አዲስ ዙር / ጨዋታ"])
def handle_new_round_text(message):
    chat_id = message.chat.id
    first_name = message.from_user.first_name or "ተሳታፊ"
    all_users.add(chat_id)
    send_main_menu(chat_id, first_name)

@bot.message_handler(func=lambda message: message.text in ["🎟 ቁጥር ለመምረጥ (BUY)", "/buy"])
def handle_buy(message):
    chat_id = message.chat.id
    user_id = message.from_user.id
    all_users.add(chat_id)
    show_number_selection(chat_id, user_id)

@bot.message_handler(commands=['draw'])
@bot.message_handler(func=lambda message: message.text == "🎲 ዕጣ ማውጣት (DRAW)")
def handle_draw(message):
    chat_id = message.chat.id
    user_id = message.from_user.id
    all_users.add(chat_id)
    if user_id != ADMIN_ID:
        bot.send_message(chat_id, "❌ ይህንን ትዕዛዝ መጠቀም የሚችሉት አድሚኑ ብቻ ናቸው!")
        return
    if not taken_numbers:
        bot.send_message(chat_id, "⚠️ እስካሁን የተያዘ አንድም ቁጥር የለም!")
        return
    threading.Thread(target=trigger_manual_draw, args=(chat_id,)).start()

@bot.callback_query_handler(func=lambda call: True)
def callback_query(call):
    chat_id = call.message.chat.id
    message_id = call.message.message_id
    user_id = call.from_user.id
    first_name = call.from_user.first_name or "ተሳታፊ"
    callback_data = call.data

    if callback_data.startswith("select_"):
        num = int(callback_data.split("_")[1])
        if num in taken_numbers:
            bot.answer_callback_query(call.id, "❌ ይህ ቁጥር ቀድሞ ተይዟል!", show_alert=True)
            return

        user_nums = round_participants.get(user_id, [])
        if len(user_nums) >= 3:
            bot.answer_callback_query(call.id, "⚠️ ከፍተኛው የ 3 ቲኬት ገደብዎ ደርሰዋል!", show_alert=True)
            return

        bot.edit_message_text("⏳ ቁጥሩ በመረጣ ላይ ነው... 🔄", chat_id, message_id, reply_markup=None)
        time.sleep(0.5)

        reply_text = (
            f"✨ የመረጡት ዕድለኛ ቁጥር: **{num}** 🎟\n"
            f"💵 መክፈል የሚኖርብዎት: **{TICKET_PRICE} ብር**\n\n"
            f"{BANK_INFO}\n\n"
            f"👇 ክፍያውን ከፈጸሙ በኋላ ከታች ያለውን ቁልፍ በመጫን ማረጋገጫ ይላኩ!"
        )
        confirm_keyboard = telebot.types.InlineKeyboardMarkup()
        confirm_keyboard.add(telebot.types.InlineKeyboardButton("✅ ክፍያ ፈጽሜአለሁ (አረጋግጥ)", callback_data=f"paid_{user_id}_{num}"))
        confirm_keyboard.add(telebot.types.InlineKeyboardButton("🔙 ወደ ቁጥሮች ዝርዝር ተመለስ", callback_data="back_to_numbers"))
        
        bot.edit_message_text(reply_text, chat_id, message_id, reply_markup=confirm_keyboard, parse_mode="Markdown")

    elif callback_data == "back_to_numbers":
        show_number_selection_inline(chat_id, message_id, user_id)

    elif callback_data.startswith("paid_"):
        parts = callback_data.split("_")
        p_user_id = int(parts[1])
        p_num = int(parts[2])

        if user_id != p_user_id:
            bot.answer_callback_query(call.id, "❌ ይህ ድርጊት የተከለከለ ነው!", show_alert=True)
            return

        pending_payments[(p_user_id, p_num)] = True
        bot.answer_callback_query(call.id, "ክፍያዎ ለአድሚን ተልኳል!")
        bot.edit_message_text("⏳ **ክፍያዎ በማጣራት ላይ ይገኛል!** አድሚኑ ሲያረጋግጠው ማሳወቂያ ይደርሰዎታል። 🚀", chat_id, message_id, parse_mode="Markdown")

        admin_text = (
            f"🔔 **አዲስ የክፍያ ማረጋገጫ ጥያቄ!** 💸\n\n"
            f"👤 ተሳታፊ: {first_name} (ID: `{p_user_id}`)\n"
            f"🔢 የጠየቀው ቁጥር: **{p_num}**\n"
            f"💵 የሚጠበቀው ብር: **{TICKET_PRICE} ብር**\n\n"
            f"እባክዎ የባንክ ገቢዎን በማየት ከታች ያለውን ይጫኑ፡"
        )
        admin_keyboard = telebot.types.InlineKeyboardMarkup()
        admin_keyboard.add(telebot.types.InlineKeyboardButton(f"✅ ቁጥር {p_num} አጽድቅ", callback_data=f"approve_{p_user_id}_{p_num}"))
        bot.send_message(ADMIN_ID, admin_text, reply_markup=admin_keyboard, parse_mode="Markdown")

    elif callback_data.startswith("approve_"):
        if user_id != ADMIN_ID:
            bot.answer_callback_query(call.id, "❌ አድሚን ብቻ ናቸው ማጽደቅ የሚችሉት!", show_alert=True)
            return

        parts = callback_data.split("_")
        target_user_id = int(parts[1])
        approved_num = int(parts[2])

        if not pending_payments.pop((target_user_id, approved_num), None):
            bot.answer_callback_query(call.id, "❌ ይህ ክፍያ ትክክለኛ አይደለም ወይም ቀድሞ ተሰርዟል!", show_alert=True)
            return

        if approved_num in taken_numbers:
            bot.answer_callback_query(call.id, "❌ ይህ ቁጥር ቀድሞ ተይዟል!", show_alert=True)
            return

        taken_numbers[approved_num] = target_user_id
        if target_user_id not in round_participants:
            round_participants[target_user_id] = []
        if approved_num not in round_participants[target_user_id]:
            round_participants[target_user_id].append(approved_num)

        bot.answer_callback_query(call.id, "ቁጥሩ ጸድቋል!")
        bot.edit_message_text(f"✅ **ቁጥር {approved_num} በአድሚን ጸድቋል!** 🎉", chat_id, message_id, parse_mode="Markdown")

        bot.send_message(target_user_id, f"🎉 **እንኳን ደስ አላችሁ! ቁጥርዎ ({approved_num}) ጸድቆ ተመዝግቧል።** 🎟✨\n📊 የያዟቸው አጠቃላይ ቁጥሮች: {len(round_participants[target_user_id])}/3", parse_mode="Markdown")

        if len(taken_numbers) >= 10:
            threading.Thread(target=trigger_full_draw).start()

def send_main_menu(chat_id, first_name):
    reply_text = (
        f"✨ ሰላም **{first_name}**! ወደ **ዕድል ማዕበል ሎተሪ** በደህና መጡ! 🎟🔥\n\n"
        f"🥇 1ኛ አሸናፊ: **400 ብር**\n"
        f"🥈 2ኛ አሸናፊ: **250 ብር**\n"
        f"🥉 3ኛ አሸናፊ: **150 ብር**\n\n"
        f"👇 ቁጥር ለመምረጥ ከታች ያለውን በተን ይጫኑ፦"
    )
    markup = telebot.types.ReplyKeyboardMarkup(resize_keyboard=True)
    markup.add(telebot.types.KeyboardButton("🎟 ቁጥር ለመምረጥ (BUY)"))
    markup.add(telebot.types.KeyboardButton("🎲 ዕጣ ማውጣት (DRAW)"), telebot.types.KeyboardButton("🔄 አዲስ ዙር / ጨዋታ"))
    bot.send_message(chat_id, reply_text, reply_markup=markup, parse_mode="Markdown")

def show_number_selection(chat_id, user_id):
    markup = get_numbers_markup(user_id)
    user_nums = round_participants.get(user_id, [])
    text = (
        f"🎯 **ከ 1 እስከ 10 ያሉ ዕድለኛ ቁጥሮች**\n\n"
        f"📊 የተያዙ: **{len(taken_numbers)}/10**\n"
        f"👤 የእርስዎ የያዟቸው ቁጥሮች: `{len(user_nums)}/3`\n\n"
        f"👇 ከታች ከሚታዩት **🟢 ነፃ** በተኖች ውስጥ የሚፈልጉትን ይጫኑ!"
    )
    bot.send_message(chat_id, text, reply_markup=markup, parse_mode="Markdown")

def show_number_selection_inline(chat_id, message_id, user_id):
    markup = get_numbers_markup(user_id)
    user_nums = round_participants.get(user_id, [])
    text = (
        f"🎯 **ከ 1 እስከ 10 ያሉ ዕድለኛ ቁጥሮች**\n\n"
        f"📊 የተያዙ: **{len(taken_numbers)}/10**\n"
        f"👤 የእርስዎ የያዟቸው ቁጥሮች: `{len(user_nums)}/3`\n\n"
        f"👇 ከታች ከሚታዩት **🟢 ነፃ** በተኖች ውስጥ የሚፈልጉትን ይጫኑ!"
    )
    bot.edit_message_text(text, chat_id, message_id, reply_markup=markup, parse_mode="Markdown")

def get_numbers_markup(user_id):
    markup = telebot.types.InlineKeyboardMarkup(row_width=2)
    buttons = []
    for i in range(1, 11):
        if i in taken_numbers:
            btn_text = f"❌ {i} (ተያዟል)"
            callback_val = f"taken_{i}"
        else:
            btn_text = f"🟢 ነፃ ({i})"
            callback_val = f"select_{i}"
        buttons.append(telebot.types.InlineKeyboardButton(btn_text, callback_data=callback_val))
    markup.add(*buttons)
    return markup

def safe_send_message(chat_id, text, markup=None):
    try:
        bot.send_message(chat_id, text, reply_markup=markup, parse_mode="Markdown")
    except Exception as e:
        if "Forbidden" in str(e) or "chat not found" in str(e):
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
            bot.send_message(chat_id, winners_text, parse_mode="Markdown")
            time.sleep(0.3)
        except:
            pass

    final_winners_text = "👑🥁 **ታላቁ የዕድል ማዕበል ሎተሪ 1ኛ፣ 2ኛ እና 3ኛ አሸናፊዎች ይፋ ሆነዋል!** 🥳🎉\n\n"
    
    for idx, (w_id, w_num) in enumerate(winning_tickets, start=1):
        prize = PRIZES.get(idx, "🎁 ሽልማት")
        final_winners_text += f"🏆 **{idx}ኛ ዕጣ (ቁጥር {w_num}):** — {prize}\n"
        try:
            bot.send_message(w_id, f"🎊 **እንኳን ደስ አላችሁ! በያዙት ቁጥር ({w_num}) {idx}ኛውን ደረጃ ({prize}) አሸንፈዋል!** 🌟🔥", parse_mode="Markdown")
        except:
            pass

    final_winners_text += (
        "\n👏 **ለአሸናፊዎቻችን ትልቅ ደስታን እንመኛለን!** 🥂\n"
        "🚀 **አዲሱ የ 10 ቁጥሮች ዙር በይፋ ተከፍቷል! ከታች የሚፈልጉትን ቁጥር ይምረጡ።** 👇"
    )

    round_participants.clear()
    taken_numbers.clear()
    pending_payments.clear()
    
    for chat_id in list(all_users):
        markup = get_numbers_markup(chat_id)
        safe_send_message(chat_id, final_winners_text, markup)

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
        bot.send_message(w_id, f"🎊 **እንኳን ደስ አላችሁ! በያዙት ቁጥር ({w_num}) የተገኘውን ሽልማት ({prize}) አሸንፈዋል!** 🌟🔥", parse_mode="Markdown")
    except:
        pass

    round_participants.clear()
    taken_numbers.clear()
    pending_payments.clear()

    for chat_id in list(all_users):
        markup = get_numbers_markup(chat_id)
        safe_send_message(chat_id, winners_text, markup)

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
            for chat_id in list(all_users):
                markup = get_numbers_markup(chat_id)
                safe_send_message(chat_id, reminder_text, markup)

threading.Thread(target=background_reminder_loop, daemon=True).start()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 10000)))
