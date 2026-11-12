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
        const sql = neon(process.env.DATABASE_URL);

        // አድሚኑን ከ ሮል (role) ጋር መፈልግ
        const admins = await sql`SELECT * FROM admins WHERE email = ${email}`;

        if (admins.length === 0) {
            return res.status(401).json({ success: false, message: 'የተሳሳተ ኢሜይል ወይም የይለፍ ቃል!' });
        }

        const admin = admins[0];

        if (admin.password !== password) {
            return res.status(401).json({ success: false, message: 'የተሳሳተ ኢሜይል ወይም የይለፍ ቃል!' });
        }

        // ቶከን እና ሮል (Role) አብሮ መመለስ
        return res.status(200).json({
            success: true,
            email: admin.email,
            role: admin.role || 'admin',
            token: 'neon_db_secure_token_' + admin.id
        });

    } catch (error) {
        console.error('Database connection error:', error);
        return res.status(500).json({ success: false, message: 'የሰርቨር ስህተት ተፈጥሯል።' });
    }
}
