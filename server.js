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

// Nuevos Esquemas para el Muro de Fe (El Núcleo)
const PostSchema = new mongoose.Schema({
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    content: { type: String, required: true },
    contentType: { type: String, enum: ['text', 'verse', 'praise', 'testimony'], default: 'text' },
    mediaUrl: { type: String },
    amenCount: { type: Number, default: 0 },
    amensBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdAt: { type: Date, default: Date.now }
});
const Post = mongoose.model('Post', PostSchema);

const ConnectionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    friendId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'accepted' },
    createdAt: { type: Date, default: Date.now }
});
const Connection = mongoose.model('Connection', ConnectionSchema);

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
        await Post.deleteMany({ authorId: userId });
        await Connection.deleteMany({ $or: [{ userId }, { friendId: userId }] });
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

// --- RUTAS DEL MURO DE FE (EL NÚCLEO) ---

// 1. Crear una publicación en el Muro
app.post('/api/feed/posts', async (req, res) => {
    try {
        const { authorId, authorName, content, contentType, mediaUrl } = req.body;
        const newPost = new Post({
            authorId,
            authorName,
            content,
            contentType: contentType || 'text',
            mediaUrl
        });
        await newPost.save();
        res.status(201).json({ success: true, post: newPost });
    } catch (error) {
        console.error("Error al publicar en el muro:", error);
        res.status(500).json({ success: false, message: "Error al publicar en el muro." });
    }
});

// 2. Obtener el Muro Dinámico (Solo del usuario y su núcleo)
app.get('/api/feed/posts/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const connections = await Connection.find({ 
            $or: [{ userId }, { friendId: userId }],
            status: 'accepted'
        });

        const trustedIds = [userId];
        connections.forEach(conn => {
            if (conn.userId.toString() === userId) trustedIds.push(conn.friendId);
            else trustedIds.push(conn.userId);
        });

        const posts = await Post.find({ authorId: { $in: trustedIds } })
            .sort({ createdAt: -1 })
            .limit(30);

        res.json({ success: true, posts });
    } catch (error) {
        console.error("Error al cargar el muro:", error);
        res.status(500).json({ success: false, message: "Error al cargar el muro." });
    }
});

// 3. Dar "Amén" a una publicación
app.post('/api/feed/posts/:postId/amen', async (req, res) => {
    try {
        const { postId } = req.params;
        const { userId } = req.body;

        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ success: false, message: "Publicación no encontrada." });

        const hasAmen = post.amensBy.includes(userId);
        if (hasAmen) {
            post.amensBy = post.amensBy.filter(id => id.toString() !== userId);
            post.amenCount = Math.max(0, post.amenCount - 1);
        } else {
            post.amensBy.push(userId);
            post.amenCount += 1;
        }

        await post.save();
        res.json({ success: true, amenCount: post.amenCount, hasAmen: !hasAmen });
    } catch (error) {
        console.error("Error al procesar el Amén:", error);
        res.status(500).json({ success: false, message: "Error al procesar el Amén." });
    }
});

// --- RUTAS DE GESTIÓN DE CONEXIONES (MI NÚCLEO) ---

// Listar conexiones del usuario
app.get('/api/feed/connections/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const connections = await Connection.find({ 
            $or: [{ userId }, { friendId: userId }],
            status: 'accepted'
        }).populate('userId friendId', 'username');

        const formatted = connections.map(conn => {
            if (!conn.userId || !conn.friendId) return null;
            const isMeTheUser = conn.userId._id.toString() === userId;
            const friend = isMeTheUser ? conn.friendId : conn.userId;
            return {
                connectionId: conn._id,
                friendName: friend ? friend.username : 'Hermano'
            };
        }).filter(Boolean);

        res.json({ success: true, connections: formatted });
    } catch (error) {
        console.error("Error al cargar conexiones:", error);
        res.status(500).json({ success: false, error: "Error al cargar conexiones" });
    }
});

// Crear conexión directa con otro usuario por username o email
app.post('/api/feed/connections', async (req, res) => {
    try {
        const { userId, recipientIdentifier } = req.body;
        
        const recipient = await User.findOne({ 
            $or: [{ username: recipientIdentifier }, { email: recipientIdentifier }] 
        });

        if (!recipient) {
            return res.status(404).json({ success: false, error: "Usuario no encontrado." });
        }

        if (recipient._id.toString() === userId) {
            return res.status(400).json({ success: false, error: "No puedes conectarte a ti mismo." });
        }

        const existing = await Connection.findOne({
            $or: [
                { userId, friendId: recipient._id },
                { userId: recipient._id, friendId: userId }
            ]
        });

        if (existing) {
            return res.status(400).json({ success: false, error: "Ya forman parte del mismo núcleo." });
        }

        const newConn = new Connection({
            userId,
            friendId: recipient._id,
            status: 'accepted'
        });

        await newConn.save();
        res.json({ success: true, message: "Conectado con éxito" });
    } catch (error) {
        console.error("Error al crear la conexión:", error);
        res.status(500).json({ success: false, error: "Error al crear la conexión" });
    }
});

// --- RUTA PARA COMPARTIR NOTA O PLAYLIST CON OTRO USUARIO EN TIEMPO REAL ---
app.post('/api/notes/share', async (req, res) => {
    try {
        const { senderUsername, recipientEmailOrUser, noteId } = req.body;
        
        const originalNote = await Note.findById(noteId);
        if (!originalNote) {
            return res.status(404).json({ error: "La nota o playlist no existe." });
        }

        const recipient = await User.findOne({ 
            $or: [{ username: recipientEmailOrUser }, { email: recipientEmailOrUser }] 
        });
        
        if (!recipient) {
            return res.status(404).json({ error: "El usuario receptor no fue encontrado por ese correo o nombre." });
        }

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
            highlighted: true,
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

// --- RUTAS DE NOTAS ---

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
