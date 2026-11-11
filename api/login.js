import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'እባክዎ ኢሜይል እና የይለፍ ቃል ያስገቡ።' });
    }

    try {
        // በ Vercel ላይ ከቀመጡት DATABASE_URL ጋር መገናኘት
        const sql = neon(process.env.DATABASE_URL);

        // አድሚኑን በዳታቤዝ ውስጥ መፈልግ
        const admins = await sql`SELECT * FROM admins WHERE email = ${email}`;

        if (admins.length === 0) {
            return res.status(401).json({ success: false, message: 'የተሳሳተ ኢሜይል ወይም የይለፍ ቃል!' });
        }

        const admin = admins[0];

        // የይለፍ ቃሉን ማረጋገጥ
        if (admin.password !== password) {
            return res.status(401).json({ success: false, message: 'የተሳሳተ ኢሜይል ወይም የይለፍ ቃል!' });
        }

        // ማረጋገጫው ትክክል ከሆነ ቶከን (Token) በመመለስ ወደ ፓነሉ እንዲገባ መፍቀድ
        return res.status(200).json({
            success: true,
            email: admin.email,
            token: 'neon_db_secure_token_' + admin.id
        });

    } catch (error) {
        console.error('Database connection error:', error);
        return res.status(500).json({ success: false, message: 'የሰርቨር ስህተት ተፈጥሯል።' });
    }
}
