const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(express.json({ limit: '15mb' }));
app.use(cors());

app.get('/', (req, res) => {
    res.send('🚀 Servidor Backend FaithNote corriendo en Render');
});

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error("🔴 ERROR: La variable MONGO_URI no está definida en las variables de entorno.");
}

mongoose.connect(MONGO_URI)
    .then(() => console.log("🟢 Conectado a MongoDB Atlas exitosamente"))
    .catch(err => console.error("🔴 Error conectando a MongoDB:", err));

// --- ESQUEMAS DE BASE DE DATOS ---

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true }, // Nombre de usuario (apodo visible)
    name: { type: String, default: '' }, // Nombre real
    email: { type: String, required: true, unique: true }, // Correo exclusivo para login
    password: { type: String, required: true },
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

// Muro de Fe (Posts con Avatar y Nombre del autor)
const PostSchema = new mongoose.Schema({
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    authorAvatar: { type: String, default: '' },
    content: { type: String, required: true },
    contentType: { type: String, enum: ['text', 'verse', 'praise', 'testimony'], default: 'text' },
    mediaUrl: { type: String },
    amenCount: { type: Number, default: 0 },
    amensBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdAt: { type: Date, default: Date.now }
});
const Post = mongoose.model('Post', PostSchema);

// Conexiones con estado 'pending' y 'accepted'
const ConnectionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Quien envía
    friendId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Quien recibe
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});
const Connection = mongoose.model('Connection', ConnectionSchema);

// --- RUTAS DE AUTENTICACIÓN ---

app.post('/api/register', async (req, res) => {
    try {
        const { username, name, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: "Faltan datos obligatorios (usuario, correo o contraseña)" });
        }

        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return res.status(400).json({ error: "Este correo ya está registrado" });
        }

        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
            return res.status(400).json({ error: "Este nombre de usuario ya está en uso" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ 
            username, 
            name: name || username, 
            email, 
            password: hashedPassword, 
            isPro: false 
        });
        await newUser.save();

        res.json({ success: true, message: "Usuario registrado con éxito" });
    } catch (err) {
        console.error("Error en registro:", err);
        res.status(500).json({ error: "Error interno en el servidor al registrar" });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Faltan datos obligatorios" });
        }

        const user = await User.findOne({ email });
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
            name: user.name || user.username,
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
        const { userId, name, email, bio, avatar } = req.body;
        if (!userId) {
            return res.status(400).json({ error: "Usuario no especificado" });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { name, email, bio, avatar },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        res.json({ 
            success: true, 
            message: "Perfil actualizado correctamente",
            user: {
                userId: updatedUser._id,
                username: updatedUser.username,
                name: updatedUser.name,
                email: updatedUser.email,
                bio: updatedUser.bio,
                avatar: updatedUser.avatar,
                isPro: updatedUser.isPro
            }
        });
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

        res.json({ success: true, message: "Cuenta y datos eliminados correctamente" });
    } catch (err) {
        console.error("Error al eliminar cuenta:", err);
        res.status(500).json({ error: "Error al eliminar cuenta" });
    }
});

// --- BUSCAR USUARIOS ---
app.get('/api/users/search', async (req, res) => {
    try {
        const searchTerm = req.query.q || req.query.query; // Soporta ambos nombres de parámetro
        const { currentUserId } = req.query;
        
        if (!searchTerm || searchTerm.trim().length < 2) {
            return res.json({ success: true, users: [] });
        }

        const regex = new RegExp(searchTerm.trim(), 'i');
        const foundUsers = await User.find({
            _id: { $ne: currentUserId },
            $or: [
                { username: regex }, 
                { name: regex },
                { email: regex } // <--- Añadido para permitir buscar por correo
            ]
        }).select('_id username name email avatar').limit(10);

        res.json({ success: true, users: foundUsers });
    } catch (error) {
        console.error("Error en búsqueda:", error);
        res.status(500).json({ success: false, error: "Error al buscar usuarios" });
    }
});

// --- RUTAS DEL MURO DE FE ---

app.post('/api/feed/posts', async (req, res) => {
    try {
        const { authorId, authorName, authorAvatar, content, contentType } = req.body;
        const newPost = new Post({
            authorId,
            authorName,
            authorAvatar,
            content,
            contentType: contentType || 'text'
        });
        await newPost.save();
        res.status(201).json({ success: true, post: newPost });
    } catch (error) {
        console.error("Error al publicar:", error);
        res.status(500).json({ success: false, message: "Error al publicar en el muro." });
    }
});

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
        console.error("Error al cargar muro:", error);
        res.status(500).json({ success: false, message: "Error al cargar el muro." });
    }
});

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
        res.status(500).json({ success: false, message: "Error al procesar el Amén." });
    }
});

// --- RUTAS DE GESTIÓN DE CONEXIONES ---

app.get('/api/feed/connections/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const acceptedConns = await Connection.find({ 
            $or: [{ userId }, { friendId: userId }],
            status: 'accepted'
        }).populate('userId friendId', 'username name avatar');

        const pendingConns = await Connection.find({
            friendId: userId,
            status: 'pending'
        }).populate('userId', 'username name avatar');

        const formatUser = (u) => {
            if (!u) return null;
            return { id: u._id, username: u.username, name: u.name || u.username, avatar: u.avatar };
        };

        const acceptedList = acceptedConns.map(conn => {
            if (!conn.userId || !conn.friendId) return null;
            const isMeTheUser = conn.userId._id.toString() === userId;
            const friend = isMeTheUser ? conn.friendId : conn.userId;
            return {
                connectionId: conn._id,
                friend: formatUser(friend)
            };
        }).filter(Boolean);

        const pendingList = pendingConns.map(conn => ({
            connectionId: conn._id,
            sender: formatUser(conn.userId)
        })).filter(p => p.sender !== null);

        res.json({ success: true, connections: acceptedList, pendingRequests: pendingList });
    } catch (error) {
        console.error("Error al cargar conexiones:", error);
        res.status(500).json({ success: false, error: "Error al cargar conexiones" });
    }
});

app.post('/api/feed/connections/request', async (req, res) => {
    try {
        const { userId, recipientId } = req.body;
        
        if (userId === recipientId) {
            return res.status(400).json({ success: false, error: "No puedes conectarte a ti mismo." });
        }

        const existing = await Connection.findOne({
            $or: [
                { userId, friendId: recipientId },
                { userId: recipientId, friendId: userId }
            ]
        });

        if (existing) {
            return res.status(400).json({ success: false, error: "Ya existe una conexión o solicitud pendiente con este usuario." });
        }

        const newConn = new Connection({
            userId,
            friendId: recipientId,
            status: 'pending'
        });

        await newConn.save();
        res.json({ success: true, message: "Solicitud de núcleo enviada con éxito" });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error al enviar solicitud" });
    }
});

app.post('/api/feed/connections/accept', async (req, res) => {
    try {
        const { connectionId } = req.body;
        const conn = await Connection.findById(connectionId);
        if (!conn) return res.status(404).json({ success: false, error: "Solicitud no encontrada" });

        conn.status = 'accepted';
        await conn.save();
        res.json({ success: true, message: "¡Nuevo miembro aceptado en el Núcleo!" });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error al aceptar solicitud" });
    }
});

app.delete('/api/feed/connections/:connectionId', async (req, res) => {
    try {
        const { connectionId } = req.params;
        await Connection.findByIdAndDelete(connectionId);
        res.json({ success: true, message: "Conexión eliminada" });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error al eliminar" });
    }
});

// --- RUTA PARA COMPARTIR ---
app.post('/api/notes/share', async (req, res) => {
    try {
        const { senderUsername, recipientEmailOrUser, noteId } = req.body;
        const originalNote = await Note.findById(noteId);
        if (!originalNote) return res.status(404).json({ error: "La nota o playlist no existe." });

        const recipient = await User.findOne({ 
            $or: [{ username: recipientEmailOrUser }, { email: recipientEmailOrUser }] 
        });
        if (!recipient) return res.status(404).json({ error: "Usuario receptor no encontrado." });

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
        res.json({ success: true, message: "¡Contenido enviado con éxito!" });
    } catch (err) {
        res.status(500).json({ error: "Error interno al compartir." });
    }
});

// --- NOTAS ---
app.get('/api/notes/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const notes = await Note.find({ userId });
        res.json(notes);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener las notas" });
    }
});

app.post('/api/notes', async (req, res) => {
    try {
        const { userId, notes } = req.body;
        if (!userId) return res.status(400).json({ error: "Usuario no especificado" });

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
        res.json({ success: true, message: "Sincronizado correctamente con MongoDB" });
    } catch (err) {
        res.status(500).json({ error: "Error al guardar notas" });
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor backend corriendo en puerto ${PORT}`);
});
