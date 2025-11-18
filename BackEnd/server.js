// =================================================================
// 1. IMPORTAR LAS HERRAMIENTAS
// =================================================================
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer'); 
const path = require('path');     
const fs = require('fs');         

// =================================================================
// 2. CONFIGURACIÓN DEL SERVIDOR
// =================================================================
const app = express();
const PUERTO = 3000;

app.use(cors());
app.use(express.json());

// --- CARPETAS PÚBLICAS (IMÁGENES) ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Carpetas del menú:
app.use('/Tacos', express.static(path.join(__dirname, '../Tacos')));
// ¡CORRECCIÓN AQUÍ! Quitamos el espacio para evitar errores
app.use('/PlatillosFuertes', express.static(path.join(__dirname, '../PlatillosFuertes'))); 
app.use('/Antojitos', express.static(path.join(__dirname, '../Antojitos')));
app.use('/Postres', express.static(path.join(__dirname, '../Postres')));
app.use('/Bebidas', express.static(path.join(__dirname, '../Bebidas')));

// =================================================================
// 3. CONEXIÓN A BASE DE DATOS (CORREGIDO A POOL)
// =================================================================
// Usamos createPool. Si usas createConnection, fallará al crear pedidos.
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'contodoychile_db',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
}).promise();
// =================================================================
// 4. CONFIGURACIÓN DE MULTER
// =================================================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/perfiles/');
    },
    filename: (req, file, cb) => {
        const nombreUnico = `usuario_${req.body.id_usuario}_${Date.now()}${path.extname(file.originalname)}`;
        cb(null, nombreUnico);
    }
});
const upload = multer({ storage: storage });

// =================================================================
// 5. RUTAS DE LA API
// =================================================================

// --- OBTENER PRODUCTOS ---
app.get('/productos', async (req, res) => {
    try {
        const [productos] = await db.query("SELECT * FROM Productos");
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        
        const productosConUrl = productos.map(prod => {
            // Reemplazamos barras invertidas y espacios
            let rutaLimpia = prod.imagen_url.replace(/\\/g, "/");
            // Aseguramos que la ruta en el JSON tampoco tenga espacios si la carpeta ya no los tiene
            rutaLimpia = rutaLimpia.replace('Platillos Fuertes', 'PlatillosFuertes');
            
            return {
                ...prod,
                imagen_url: `${baseUrl}/${rutaLimpia}` 
            };
        });
        res.status(200).json(productosConUrl);
    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error al cargar menú.' });
    }
});

// --- REGISTRO ---
app.post('/registrar', async (req, res) => {
    const { nombre, email, contrasena, telefono } = req.body;
    if (!nombre || !email || !contrasena) return res.status(400).json({ mensaje: 'Datos incompletos.' });

    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(contrasena, salt);
        await db.query("INSERT INTO Usuarios (nombre_completo, email, contrasena_hash, telefono) VALUES (?, ?, ?, ?)", [nombre, email, hash, telefono || null]);
        res.status(201).json({ mensaje: 'Registrado' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ mensaje: 'Correo ya registrado.' });
        res.status(500).json({ mensaje: 'Error del servidor.' });
    }
});

// --- LOGIN ---
app.post('/login', async (req, res) => {
    const { email, contrasena } = req.body;
    if (!email || !contrasena) return res.status(400).json({ mensaje: 'Datos incompletos.' });

    try {
        const [rows] = await db.query("SELECT * FROM Usuarios WHERE email = ?", [email]);
        if (rows.length === 0) return res.status(404).json({ mensaje: 'Usuario no encontrado.' });

        const usuario = rows[0];
        const valid = await bcrypt.compare(contrasena, usuario.contrasena_hash);
        if (!valid) return res.status(401).json({ mensaje: 'Contraseña incorrecta.' });

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        let fotoUrl = usuario.foto_perfil_url;
        if (fotoUrl && !fotoUrl.startsWith('http')) {
             fotoUrl = `${baseUrl}/${fotoUrl.replace(/\\/g, "/")}`;
        }

        const datosUsuario = {
            id: usuario.id_usuario,
            name: usuario.nombre_completo,
            email: usuario.email,
            address: usuario.direccion || "",
            phone: usuario.telefono || "",
            profilePic: fotoUrl || `${baseUrl}/imagenes/perfil-default.png`
        };
        res.status(200).json({ mensaje: 'Login OK', usuario: datosUsuario });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error del servidor.' });
    }
});

// --- CREAR PEDIDO ---
app.post('/crear-pedido', async (req, res) => {
    const { id_usuario, items } = req.body; 
    if (!id_usuario || !items || items.length === 0) return res.status(400).json({ mensaje: 'Pedido vacío.' });

    // Esto SOLO funciona si usamos createPool arriba
    const conn = await db.getConnection(); 
    try {
        await conn.beginTransaction();
        const total = items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0);
        
        const [resPedido] = await conn.query("INSERT INTO Pedidos (id_usuario, total_pedido, estado) VALUES (?, ?, 'En preparación')", [id_usuario, total]);
        const idPedido = resPedido.insertId;
        const detalles = items.map(item => [idPedido, item.id, item.quantity, item.price]);
        
        await conn.query("INSERT INTO Detalles_Pedido (id_pedido, id_producto, cantidad, precio_unitario) VALUES ?", [detalles]);

        await conn.commit();
        res.status(201).json({ mensaje: 'Pedido creado', id_pedido: idPedido });
    } catch (error) {
        await conn.rollback();
        console.error("Error al crear pedido:", error);
        res.status(500).json({ mensaje: 'Error al procesar pedido.' });
    } finally {
        conn.release();
    }
});

// --- MIS PEDIDOS ---
app.get('/mis-pedidos/:id_usuario', async (req, res) => {
    try {
        const [pedidos] = await db.query("SELECT * FROM Pedidos WHERE id_usuario = ? ORDER BY fecha_pedido DESC", [req.params.id_usuario]);
        for (let pedido of pedidos) {
            const [detalles] = await db.query(`SELECT d.cantidad, d.precio_unitario, p.nombre FROM Detalles_Pedido d JOIN Productos p ON d.id_producto = p.id_producto WHERE d.id_pedido = ?`, [pedido.id_pedido]);
            pedido.items = detalles;
        }
        res.status(200).json(pedidos);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al obtener pedidos.' });
    }
});

// --- ACTUALIZAR PERFIL ---
app.put('/actualizar-perfil', async (req, res) => {
    const { id_usuario, nombre, direccion, telefono } = req.body;
    try {
        await db.query("UPDATE Usuarios SET nombre_completo = ?, direccion = ?, telefono = ? WHERE id_usuario = ?", [nombre, direccion, telefono, id_usuario]);
        res.status(200).json({ mensaje: 'Perfil actualizado' });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al actualizar.' });
    }
});

// --- SUBIR FOTO ---
app.post('/subir-foto', upload.single('fotoPerfil'), async (req, res) => {
    if (!req.file) return res.status(400).json({ mensaje: 'No hay archivo.' });
    const id_usuario = req.body.id_usuario;
    const nuevaRuta = req.file.path.replace(/\\/g, "/");

    try {
        const [rows] = await db.query("SELECT foto_perfil_url FROM Usuarios WHERE id_usuario = ?", [id_usuario]);
        if (rows.length > 0 && rows[0].foto_perfil_url && !rows[0].foto_perfil_url.includes('default')) {
            try { fs.unlinkSync(rows[0].foto_perfil_url); } catch(e) {}
        }
        await db.query("UPDATE Usuarios SET foto_perfil_url = ? WHERE id_usuario = ?", [nuevaRuta, id_usuario]);
        const fullUrl = `${req.protocol}://${req.get('host')}/${nuevaRuta}`;
        res.status(200).json({ mensaje: 'Foto subida', nuevaFotoUrl: fullUrl });
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al guardar foto.' });
    }
});

app.listen(PUERTO, () => {
    console.log(`Servidor corriendo en http://localhost:${PUERTO}`);
});
const PORT = process.env.PORT || 3000; // La nube nos dará un puerto, si no, usa el 3000
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});