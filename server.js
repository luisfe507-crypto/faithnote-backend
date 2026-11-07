const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middlewares (Límite aumentado a 15mb para asegurar imágenes en base64 y múltiples enlaces de playlist)
app.use(express.json({ limit: '15mb' }));
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
    associatedService: { type: String, default: '' },
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

// --- RUTA SEGURA DE INTELIGENCIA ARTIFICIAL (OPENAI) ---
app.post('/api/ai', async (req, res) => {
    try {
        const { messages, model } = req.body;
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: "La clave de OpenAI no está configurada en las variables de entorno del servidor." });
        }

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model || "gpt-4o-mini",
                messages: messages,
                temperature: 0.5
            })
        });

        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error("Error conectando con OpenAI:", err);
        res.status(500).json({ error: "Error al procesar la solicitud con IA" });
    }
});

// --- RUTA PARA COMPARTIR NOTA O PLAYLIST CON OTRO USUARIO EN TIEMPO REAL ---
app.post('/api/notes/share', async (req, res) => {
    try {
        const { senderUsername, recipientEmailOrUser, noteId } = req.body;
        
        // 1. Buscar la nota original del remitente
        const originalNote = await Note.findById(noteId);
        if (!originalNote) {
            return res.status(404).json({ error: "La nota o playlist no existe." });
        }

        // 2. Buscar al usuario receptor por nombre de usuario o correo
        const recipient = await User.findOne({ 
            $or: [{ username: recipientEmailOrUser }, { email: recipientEmailOrUser }] 
        });
        
        if (!recipient) {
            return res.status(404).json({ error: "El usuario receptor no fue encontrado por ese correo o nombre." });
        }

        // 3. Crear una copia de la nota directamente en la cuenta de MongoDB del receptor
        const sharedNote = new Note({
            userId: recipient._id,
            title: `${originalNote.title} (Compartido por ${senderUsername})`,
            preacher: originalNote.preacher,
            verse: originalNote.verse,
            content: originalNote.content,
            tag: originalNote.tag || 'Fe',
            color: originalNote.color || '#fffbeb',
            sticker: originalNote.sticker || '✨',
            photo: originalNote.photo || '',
            date: originalNote.date,
            displayDate: originalNote.displayDate,
            highlighted: true, // Se destaca automáticamente para que la vea de primera
            type: originalNote.type || 'note',
            associatedService: originalNote.associatedService || '',
            worshipList: originalNote.worshipList || []
        });

        await sharedNote.save();
        res.json({ success: true, message: "¡Contenido enviado al muro del destinatario con éxito!" });
    } catch (err) {
        console.error("Error al compartir:", err);
        res.status(500).json({ error: "Error interno al procesar el compartir." });
    }
});

// --- RUTAS DE NOTAS (PERSISTENCIA DE ORDEN, STICKERS, FOTOS, PLAYLISTS Y SERVICIOS) ---

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

        // Borrar registros anteriores del usuario y reemplazar con la lista actual sincronizada
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
                associatedService: n.associatedService || '',
                worshipList: n.worshipList || []
            }));
            await Note.insertMany(notesToSave);
        }

        res.json({ success: true, message: "Notas, playlists, servicios y orden sincronizados correctamente con MongoDB" });
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
