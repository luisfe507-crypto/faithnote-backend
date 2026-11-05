const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Health Check para Render
app.get('/', (req, res) => {
    res.send('🚀 Servidor Backend FaithNote corriendo en Render');
});

// Conexión a MongoDB
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error("🔴 ERROR: La variable MONGO_URI no está definida en las variables de entorno.");
}

mongoose.connect(MONGO_URI)
    .then(() => console.log("🟢 Conectado a MongoDB Atlas exitosamente"))
    .catch(err => console.error("🔴 Error conectando a MongoDB:", err));

// --- ESQUEMAS DE BASE DE DATOS ---

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isPro: { type: Boolean, default: false }
});
const User = mongoose.model('User', UserSchema);

const NoteSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: String,
    preacher: String,
    verse: String,
    content: String,
    tag: String,
    color: String,
    date: String,
    displayDate: String,
    highlighted: Boolean
});
const Note = mongoose.model('Note', NoteSchema);

// --- RUTAS DE AUTENTICACIÓN ---

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: "Faltan datos obligatorios" });
        }

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: "El nombre de usuario ya está registrado" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword, isPro: false });
        await newUser.save();

        res.json({ success: true, message: "Usuario registrado con éxito" });
    } catch (err) {
        console.error("Error en registro:", err);
        res.status(500).json({ error: "Error interno en el servidor al registrar" });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ error: "Credenciales inválidas" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Credenciales inválidas" });
        }

        res.json({
            success: true,
            userId: user._id,
            username: user.username,
            isPro: user.isPro
        });
    } catch (err) {
        console.error("Error en login:", err);
        res.status(500).json({ error: "Error interno en el servidor al iniciar sesión" });
    }
});

// --- RUTAS DE NOTAS ---

app.get('/api/notes/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const notes = await Note.find({ userId }).sort({ _id: -1 });
        res.json(notes);
    } catch (err) {
        console.error("Error al obtener notas:", err);
        res.status(500).json({ error: "Error al obtener las notas" });
    }
});

app.post('/api/notes', async (req, res) => {
    try {
        const { userId, notes } = req.body;
        if (!userId) {
            return res.status(400).json({ error: "Usuario no especificado" });
        }

        await Note.deleteMany({ userId });
        
        if (notes && notes.length > 0) {
            const notesToSave = notes.map(n => ({
                userId,
                title: n.title,
                preacher: n.preacher,
                verse: n.verse,
                content: n.content,
                tag: n.tag || 'Fe',
                color: n.color || '#ffffff',
                date: n.date,
                displayDate: n.displayDate,
                highlighted: n.highlighted || false
            }));
            await Note.insertMany(notesToSave);
        }

        res.json({ success: true, message: "Notas sincronizadas correctamente con MongoDB" });
    } catch (err) {
        console.error("Error al guardar notas:", err);
        res.status(500).json({ error: "Error al guardar notas en la base de datos" });
    }
});

// Inicializar Servidor (Vincular a 0.0.0.0 para Render)
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor backend corriendo en puerto ${PORT}`);
});