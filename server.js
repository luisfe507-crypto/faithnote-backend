const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middlewares (Aumentado el límite a 10mb para soportar imágenes en base64)
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
    email: { type: String, default: '' },
    bio: { type: String, default: '' },
    avatar: { type: String, default: '' },
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
    sticker: String,
    photo: String,
    date: String,
    displayDate: String,
    highlighted: Boolean,
    type: { type: String, default: 'note' },
    worshipList: [{
        id: String,
        youtubeId: String,
        title: String,
        rawInput: String
    }]
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
        if (!username || !password) {
            return res.status(400).json({ error: "Faltan datos obligatorios" });
        }

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
            email: user.email,
            bio: user.bio,
            avatar: user.avatar,
            isPro: user.isPro
        });
    } catch (err) {
        console.error("Error en login:", err);
        res.status(500).json({ error: "Error interno en el servidor al iniciar sesión" });
    }
});

// --- RUTAS DE PERFIL ---

app.post('/api/profile', async (req, res) => {
    try {
        const { userId, email, bio, avatar } = req.body;
        if (!userId) {
            return res.status(400).json({ error: "Usuario no especificado" });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { email, bio, avatar },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        res.json({ success: true, message: "Perfil actualizado correctamente en MongoDB" });
    } catch (err) {
        console.error("Error al actualizar perfil:", err);
        res.status(500).json({ error: "Error al actualizar perfil en la base de datos" });
    }
});

app.delete('/api/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        await Note.deleteMany({ userId });
        await User.findByIdAndDelete(userId);

        res.json({ success: true, message: "Cuenta y datos eliminados correctamente de MongoDB" });
    } catch (err) {
        console.error("Error al eliminar cuenta:", err);
        res.status(500).json({ error: "Error al eliminar cuenta en la base de datos" });
    }
});

// --- RUTAS DE NOTAS (PERSISTENCIA DE ORDEN, STICKERS, FOTOS Y ALABANZAS) ---

app.get('/api/notes/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const notes = await Note.find({ userId });
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
                sticker: n.sticker || '',
                photo: n.photo || '',
                date: n.date,
                displayDate: n.displayDate,
                highlighted: n.highlighted || false,
                type: n.type || 'note',
                worshipList: n.worshipList || []
            }));
            await Note.insertMany(notesToSave);
        }

        res.json({ success: true, message: "Notas y orden sincronizados correctamente con MongoDB" });
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
