import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
    const sql = neon(process.env.DATABASE_URL);

    // መጽሐፍትን ማንበብ (GET)
    if (req.method === 'GET') {
        try {
            const books = await sql`SELECT * FROM books ORDER BY id DESC`;
            return res.status(200).json({ success: true, books });
        } catch (error) {
            console.error('Error fetching books:', error);
            return res.status(500).json({ success: false, message: 'መጽሐፍትን ማምጣት አልተቻለም።' });
        }
    }

    // አዲስ መጽሐፍ መመዝገብ (POST)
    if (req.method === 'POST') {
        const { title, author, price, image_url } = req.body;

        if (!title || !author || !price) {
            return res.status(400).json({ success: false, message: 'እባክዎ ርዕስ፣ ደራሲ እና ዋጋ ይሙሉ!' });
        }

        try {
            const result = await sql`
                INSERT INTO books (title, author, price, image_url) 
                VALUES (${title}, ${author}, ${price}, ${image_url || ''}) 
                RETURNING *
            `;
            return res.status(201).json({ success: true, book: result[0] });
        } catch (error) {
            console.error('Error inserting book:', error);
            return res.status(500).json({ success: false, message: 'መጽሐፍ መመዝገብ አልተቻለም።' });
        }
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });
}
