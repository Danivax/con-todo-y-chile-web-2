const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer'); 
const path = require('path');     
const fs = require('fs');         

const app = express();
const PUERTO = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// CARPETAS PÚBLICAS
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/Tacos', express.static(path.join(__dirname, '../Tacos')));
app.use('/PlatillosFuertes', express.static(path.join(__dirname, '../PlatillosFuertes')));
app.use('/Antojitos', express.static(path.join(__dirname, '../Antojitos')));
app.use('/Postres', express.static(path.join(__dirname, '../Postres')));
app.use('/Bebidas', express.static(path.join(__dirname, '../Bebidas')));

// Sirve los archivos HTML, CSS y JS de la carpeta principal
app.use(express.static(path.join(__dirname, '../')));

// CONEXIÓN A BASE DE DATOS (¡CORREGIDO A POOL!)
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

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/perfiles/';
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const nombreUnico = `usuario_${req.body.id_usuario}_${Date.now()}${path.extname(file.originalname)}`;
        cb(null, nombreUnico);
    }
});
const upload = multer({ storage: storage });

// --- RUTAS ---

app.get('/productos', async (req, res) => {
    try {
        const [productos] = await db.query("SELECT * FROM Productos");
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const productosConUrl = productos.map(prod => {
            const rutaLimpia = prod.imagen_url.replace(/\\/g, "/").replace('Platillos Fuertes', 'PlatillosFuertes');
            return { ...prod, imagen_url: `${baseUrl}/${rutaLimpia}` };
        });
        res.status(200).json(productosConUrl);
    } catch (error) { res.status(500).json({ mensaje: 'Error menú.' }); }
});

app.post('/registrar', async (req, res) => {
    const { nombre, email, contrasena, telefono } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(contrasena, salt);
        await db.query("INSERT INTO Usuarios (nombre_completo, email, contrasena_hash, telefono) VALUES (?, ?, ?, ?)", [nombre, email, hash, telefono || null]);
        res.status(201).json({ mensaje: 'Registrado' });
    } catch (error) { res.status(500).json({ mensaje: 'Error registro.' }); }
});

app.post('/login', async (req, res) => {
    const { email, contrasena } = req.body;
    try {
        const [rows] = await db.query("SELECT * FROM Usuarios WHERE email = ?", [email]);
        if (rows.length === 0) return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
        const usuario = rows[0];
        const valid = await bcrypt.compare(contrasena, usuario.contrasena_hash);
        if (!valid) return res.status(401).json({ mensaje: 'Contraseña incorrecta.' });

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        let fotoUrl = usuario.foto_perfil_url;
        if (fotoUrl && !fotoUrl.startsWith('http')) { fotoUrl = `${baseUrl}/${fotoUrl.replace(/\\/g, "/")}`; }

        const datosUsuario = {
            id: usuario.id_usuario,
            name: usuario.nombre_completo,
            email: usuario.email,
            address: usuario.direccion || "",
            phone: usuario.telefono || "",
            profilePic: fotoUrl || `${baseUrl}/imagenes/perfil-default.png`
        };
        res.status(200).json({ mensaje: 'Login OK', usuario: datosUsuario });
    } catch (error) { res.status(500).json({ mensaje: 'Error login.' }); }
});

app.post('/crear-pedido', async (req, res) => {
    const { id_usuario, items } = req.body; 
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
    } catch (error) { await conn.rollback(); res.status(500).json({ mensaje: 'Error pedido.' }); } 
    finally { conn.release(); }
});

app.get('/mis-pedidos/:id_usuario', async (req, res) => {
    try {
        const [pedidos] = await db.query("SELECT * FROM Pedidos WHERE id_usuario = ? ORDER BY fecha_pedido DESC", [req.params.id_usuario]);
        for (let pedido of pedidos) {
            const [detalles] = await db.query(`SELECT d.cantidad, d.precio_unitario, p.nombre FROM Detalles_Pedido d JOIN Productos p ON d.id_producto = p.id_producto WHERE d.id_pedido = ?`, [pedido.id_pedido]);
            pedido.items = detalles;
        }
        res.status(200).json(pedidos);
    } catch (error) { res.status(500).json({ mensaje: 'Error historial.' }); }
});

app.put('/actualizar-perfil', async (req, res) => {
    const { id_usuario, nombre, direccion, telefono } = req.body;
    try {
        await db.query("UPDATE Usuarios SET nombre_completo = ?, direccion = ?, telefono = ? WHERE id_usuario = ?", [nombre, direccion, telefono, id_usuario]);
        res.status(200).json({ mensaje: 'Perfil actualizado' });
    } catch (error) { res.status(500).json({ mensaje: 'Error actualizar.' }); }
});

app.post('/subir-foto', upload.single('fotoPerfil'), async (req, res) => {
    if (!req.file) return res.status(400).json({ mensaje: 'No hay archivo.' });
    const id_usuario = req.body.id_usuario;
    const nuevaRuta = req.file.path.replace(/\\/g, "/");
    try {
        await db.query("UPDATE Usuarios SET foto_perfil_url = ? WHERE id_usuario = ?", [nuevaRuta, id_usuario]);
        const fullUrl = `${req.protocol}://${req.get('host')}/${nuevaRuta}`;
        res.status(200).json({ mensaje: 'Foto subida', nuevaFotoUrl: fullUrl });
    } catch (error) { res.status(500).json({ mensaje: 'Error foto.' }); }
});

// RUTA SECRETA
app.get('/setup-menu', async (req, res) => {
    try {
        await db.query(`CREATE TABLE IF NOT EXISTS Usuarios (id_usuario INT AUTO_INCREMENT PRIMARY KEY, nombre_completo VARCHAR(100), email VARCHAR(100) UNIQUE, contrasena_hash VARCHAR(255), direccion TEXT, telefono VARCHAR(20), foto_perfil_url VARCHAR(255), fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        await db.query(`CREATE TABLE IF NOT EXISTS Productos (id_producto VARCHAR(10) PRIMARY KEY, nombre VARCHAR(100), descripcion TEXT, precio DECIMAL(10, 2), categoria VARCHAR(50), imagen_url VARCHAR(255), emoji VARCHAR(10))`);
        await db.query(`CREATE TABLE IF NOT EXISTS Pedidos (id_pedido INT AUTO_INCREMENT PRIMARY KEY, id_usuario INT, fecha_pedido DATETIME DEFAULT CURRENT_TIMESTAMP, total_pedido DECIMAL(10, 2), estado VARCHAR(50), FOREIGN KEY (id_usuario) REFERENCES Usuarios(id_usuario))`);
        await db.query(`CREATE TABLE IF NOT EXISTS Detalles_Pedido (id_detalle INT AUTO_INCREMENT PRIMARY KEY, id_pedido INT, id_producto VARCHAR(10), cantidad INT, precio_unitario DECIMAL(10, 2), FOREIGN KEY (id_pedido) REFERENCES Pedidos(id_pedido))`);
        
        // (Si ya tienes datos, puedes borrar esta parte del DELETE)
        await db.query("DELETE FROM Detalles_Pedido");
        await db.query("DELETE FROM Productos");

        const valores = [
            ['t1', 'Tacos al Pastor', 'Carne al pastor, piña, cebolla y cilantro.', 85.00, 'tacos', 'Tacos/Pastor.jpg', '🌮'],
            ['t2', 'Tacos de Carnitas', 'Carnitas doradas con cebolla y cilantro.', 80.00, 'tacos', 'Tacos/tacos-de-carnitas-en-CDMX-social-1.jpg', '🌮'],
            ['t3', 'Tacos de Barbacoa', 'Barbacoa de res con consomé y cebolla.', 90.00, 'tacos', 'Tacos/Barbacoa.jpg', '🌮'],
            ['t4', 'Tacos de Suadero', 'Suadero tierno con salsa verde.', 75.00, 'tacos', 'Tacos/SuaderoTacos.jpg', '🌮'],
            ['t5', 'Tacos de Lengua', 'Lengua cocida y sazonada al estilo tradicional.', 95.00, 'tacos', 'Tacos/Lengua.jpg', '🌮'],
            ['t6', 'Tacos de Chorizo', 'Chorizo mexicano con papa y queso.', 70.00, 'tacos', 'Tacos/chorizo-tacos.jpg', '🌮'],
            ['t7', 'Tacos de Pescado', 'Pescado empanizado con repollo y chipotle.', 100.00, 'tacos', 'Tacos/Fish-Tacos.jpg', '🌮'],
            ['t8', 'Tacos de Camarón', 'Camarones al ajillo con aguacate.', 110.00, 'tacos', 'Tacos/Camaron.jpg', '🌮'],
            ['t9', 'Tacos Vegetarianos', 'Champiñones, nopales y rajas con queso.', 65.00, 'tacos', 'Tacos/Vegan-Taco.jpg', '🌮'],
            ['t10', 'Tacos de Birria', 'Birria de res con consomé y cebolla morada.', 105.00, 'tacos', 'Tacos/Birria.jpg', '🌮'],
            ['t11', 'Tacos de Cecina', 'Cecina de res con queso panela.', 85.00, 'tacos', 'Tacos/Cecina.jpg', '🌮'],
            ['t12', 'Tacos de Costilla', 'Costilla asada con salsa roja.', 95.00, 'tacos', 'Tacos/Costilla.jpg', '🌮'],
            ['t13', 'Tacos de Pollo', 'Pollo deshebrado con salsa verde.', 75.00, 'tacos', 'Tacos/tacos-de-pollo.jpg', '🌮'],
            ['t14', 'Tacos de Tinga', 'Tinga de pollo con chipotle y cebolla.', 80.00, 'tacos', 'Tacos/Tinga.jpg', '🌮'],
            ['t15', 'Tacos Gobernador', 'Camarón, queso y chile serrano.', 120.00, 'tacos', 'Tacos/tacosgobernador.jpg', '🌮'],
            ['f1', 'Mole Poblano', 'Pollo en salsa de mole con arroz y tortillas.', 120.00, 'fuertes', 'PlatillosFuertes/Mole Poblano.jpg', '🍲'],
            ['f2', 'Costillas BBQ', 'Costillas bañadas en salsa BBQ picante.', 150.00, 'fuertes', 'PlatillosFuertes/Costilla BBQ.jpg', '🍖'],
            ['f3', 'Enchiladas Supreme', 'Enchiladas verdes o rojas con pollo o queso.', 110.00, 'fuertes', 'PlatillosFuertes/Enchiladas.jpg', '🥘'],
            ['f4', 'Pollo en Mole Negro', 'Pollo en mole oaxaqueño con plátano frito.', 130.00, 'fuertes', 'PlatillosFuertes/Pollo en Mole Negro.jpg', '🍗'],
            ['f5', 'Carne Asada', 'Carne asada con guacamole, arroz y frijoles.', 140.00, 'fuertes', 'PlatillosFuertes/carneasada.jpg', '🥩'],
            ['f6', 'Pescado a la Veracruzana', 'Filete de pescado en salsa de jitomate y aceitunas.', 135.00, 'fuertes', 'PlatillosFuertes/Pescado al la Veracruzana.jpg', '🐟'],
            ['f7', 'Camarones al Mojo de Ajo', 'Camarones salteados en ajo y mantequilla.', 160.00, 'fuertes', 'PlatillosFuertes/camarones-al-mojo-de-ajo.jpg', '🦐'],
            ['f8', 'Cochinita Pibil', 'Cochinita marinada en achiote con cebolla morada.', 125.00, 'fuertes', 'PlatillosFuertes/cochinita-pibil.jpg', '🐷'],
            ['f9', 'Chiles en Nogada', 'Chiles poblanos rellenos con frutas y nuez, temporada.', 170.00, 'fuertes', 'PlatillosFuertes/chiles-en-nogad.jpg', '🍗'],
            ['f10', 'Bistec Encebollado', 'Bistec con cebolla caramelizada y papas.', 115.00, 'fuertes', 'PlatillosFuertes/Bistec Encebollado.jpg', '🍖'],
            ['f11', 'Pollo Relleno', 'Pechuga rellena de espinacas y queso.', 120.00, 'fuertes', 'PlatillosFuertes/Pollo Relleno.jpg', '🍗'],
            ['f12', 'Milanesa Napolitana', 'Milanesa con jitomate, jamón y queso derretido.', 110.00, 'fuertes', 'PlatillosFuertes/Milanesa Napolitana.jpg', '🥩'],
            ['f13', 'Pozole Rojo', 'Pozole con carne de puerco, lechuga y rábano.', 95.00, 'fuertes', 'PlatillosFuertes/Pozole_Rojo.jpg', '🍲'],
            ['f14', 'Pozole Verde', 'Pozole con salsa verde y pollo.', 90.00, 'fuertes', 'PlatillosFuertes/Pozole-Verde.jpg', '🍲'],
            ['f15', 'Chuletas en Salsa de Chile', 'Chuletas de cerdo en salsa de chile pasilla.', 125.00, 'fuertes', 'PlatillosFuertes/receta-de-chuletas-en-salsa-de-chile-pasilla.jpg', '🍖'],
            ['a1', 'Burrito Picante', 'Burrito relleno de carne, frijoles, queso y chiles.', 95.00, 'antojitos', 'Antojitos/Burrito Picante.jpg', '🌯'],
            ['a2', 'Hot Dog Mexicano', 'Hot dog con tocino, mayonesa, queso y jalapeños.', 65.00, 'antojitos', 'Antojitos/Hot Dog Mexicano.jpg', '🌭'],
            ['a3', 'Papas Locas', 'Papas fritas con chamoy, limón, chile y queso.', 55.00, 'antojitos', 'Antojitos/Papas Locas.jpg', '🍟'],
            ['a4', 'Quesadillas', 'Quesadillas de flor de calabaza, huitlacoche o queso.', 60.00, 'antojitos', 'Antojitos/Quesadillas.jpg', '🧆'],
            ['a5', 'Sopes', 'Sopes con frijoles, queso, lechuga y crema.', 50.00, 'antojitos', 'Antojitos/Sopes.jpg', '🫓'],
            ['a6', 'Gorditas', 'Gorditas rellenas de chicharrón, frijoles o queso.', 45.00, 'antojitos', 'Antojitos/Gorditas.jpg', '🌮'],
            ['a7', 'Tostadas', 'Tostadas de tinga, ceviche o frijoles refritos.', 55.00, 'antojitos', 'Antojitos/Tostadas.jpg', '🥙'],
            ['a8', 'Empanadas', 'Empanadas fritas de carne, pollo o queso.', 40.00, 'antojitos', 'Antojitos/Empanadas.jpg', '🥟'],
            ['a9', 'Tacos Dorados', 'Tacos dorados de papa o picadillo con lechuga.', 50.00, 'antojitos', 'Antojitos/Tacos Dorados.jpg', '🌭'],
            ['a10', 'Chalupas', 'Chalupas con salsa verde, carne y queso.', 45.00, 'antojitos', 'Antojitos/Chalupas.jpg', '🧆'],
            ['a11', 'Esquites', 'Esquites con mayonesa, chile, limón y queso.', 35.00, 'antojitos', 'Antojitos/Esquites.jpg', '🫘'],
            ['a12', 'Elote', 'Elote asado con mayonesa, chile y queso.', 40.00, 'antojitos', 'Antojitos/Elote.JPG', '🌽'],
            ['a13', 'Tamales', 'Tamales de mole, rajas o dulce (por pieza).', 30.00, 'antojitos', 'Antojitos/Tamales.jpg', '🥟'],
            ['a14', 'Choriqueso', 'Chorizo con queso derretido y tortillas.', 70.00, 'antojitos', 'Antojitos/Choriqueso.jpg', '🌭'],
            ['a15', 'Flautas', 'Flautas de pollo o res con crema y queso.', 60.00, 'antojitos', 'Antojitos/Flautas.jpg', '🧆'],
            ['p1', 'Flan Napolitano', 'Flan clásico con caramelo y crema.', 45.00, 'postres', 'Postres/Flan Napotilano.jpg', '🍮'],
            ['p2', 'Pastel Tres Leches', 'Pastel esponjoso bañado en tres leches.', 55.00, 'postres', 'Postres/Pastel Tres Leches.jpg', '🥧'],
            ['p3', 'Churros con Chocolate', 'Churros crujientes con chocolate caliente.', 50.00, 'postres', 'Postres/Churoos Con Chocolate.jpg', '🍪'],
            ['p4', 'Helado de Cajeta', 'Helado artesanal sabor cajeta.', 40.00, 'postres', 'Postres/Helado de Cajeta.jpg', '🍨'],
            ['p5', 'Buñuelos', 'Buñuelos crujientes con miel de piloncillo.', 35.00, 'postres', 'Postres/Buñuelos.jpg', '🍩'],
            ['p6', 'Arroz con Leche', 'Arroz con leche, canela y pasas.', 30.00, 'postres', 'Postres/Arroz Con Leche.jpg', '🍮'],
            ['p7', 'Pay de Queso', 'Pay de queso con base de galleta.', 50.00, 'postres', 'Postres/Pay de Queso.jpg', '🥧'],
            ['p8', 'Gelatina de Mosaico', 'Gelatina colorida con leche condensada.', 35.00, 'postres', 'Postres/Gelatina de Mosaico.jpg', '🍮'],
            ['p9', 'Galletas de Avena', 'Galletas caseras de avena y pasas.', 25.00, 'postres', 'Postres/Galletas de Avena.jpg', '🍪'],
            ['p10', 'Nieve de Garrafa', 'Nieve artesanal de limón, mango o fresa.', 40.00, 'postres', 'Postres/Nieve de Garrafa.jpg', '🍦'],
            ['p11', 'Rosca de Reyes', 'Rosca tradicional con frutas escarchadas.', 80.00, 'postres', 'Postres/Rosca de Reyes.jpg', '🍩'],
            ['p12', 'Capirotada', 'Pan con queso, piloncillo y nuez.', 45.00, 'postres', 'Postres/Capirotada.jpg', '🍮'],
            ['p13', 'Polvorones', 'Galletas de nuez con azúcar glass.', 30.00, 'postres', 'Postres/Polvorones.jpg', '🍪'],
            ['p14', 'Helado de Fresa', 'Helado natural de fresa con crema.', 40.00, 'postres', 'Postres/Helado de Fresa.jpg', '🍦'],
            ['p15', 'Pastel de Zanahoria', 'Pastel húmedo con nuez y betún de queso.', 55.00, 'postres', 'Postres/Pastel de Zanahoria.jpg', '🥧'],
            ['b1', 'Agua de Jamaica', 'Agua fresca de jamaica natural.', 25.00, 'bebidas', 'Bebidas/Agua de Jamaica.jpg', '🥤'],
            ['b2', 'Agua de Horchata', 'Horchata cremosa con canela.', 25.00, 'bebidas', 'Bebidas/Agua de Horchata.jpg', '🥤'],
            ['b3', 'Agua de Tamarindo', 'Agua de tamarindo 100% natural.', 25.00, 'bebidas', 'Bebidas/Agua de Tamarindo.jpg', '🥤'],
            ['b4', 'Agua de Sandía', 'Refrescante agua de sandía con limón.', 25.00, 'bebidas', 'Bebidas/Agua de Sandia.jpg', '🥤'],
            ['b5', 'Agua de Piña', 'Jugo natural de piña con menta.', 25.00, 'bebidas', 'Bebidas/Agua de Piña.jpg', '🥤'],
            ['b6', 'Limonada Natural', 'Limonada exprimida con hielo.', 30.00, 'bebidas', 'Bebidas/Limonada Natural.jpg', '🥤'],
            ['b7', 'Refresco (600ml)', 'Coca-Cola, Sprite, Fanta o Sidral Mundet.', 35.00, 'bebidas', 'Bebidas/Refresco.jpg', '🥤'],
            ['b8', 'Cerveza Nacional', 'Corona, Modelo o Victoria (355ml).', 50.00, 'bebidas', 'Bebidas/Cerveza Nacional.jpg', '🥤'],
            ['b9', 'Cerveza Artesanal', 'IPA o Lager local (500ml).', 70.00, 'bebidas', 'Bebidas/Cerveza Artesanal.jpg', '🥤'],
            ['b10', 'Michelada', 'Cerveza con jugo de tomate, limón y chile.', 65.00, 'bebidas', 'Bebidas/Michelada.jpg', '🥤'],
            ['b11', 'Clamato Preparado', 'Clamato con chile, limón y hielo.', 40.00, 'bebidas', 'Bebidas/Clamato Preparado.jpg', '🥤'],
            ['b12', 'Naranjada', 'Jugo natural de naranja con hielo.', 30.00, 'bebidas', 'Bebidas/Naranjada.jpg', '🥤'],
            ['b13', 'Agua Mineral', 'Agua embotellada de 600ml.', 20.00, 'bebidas', 'Bebidas/Agua Mineral.jpg', '🥤'],
            ['b14', 'Café Americano', 'Café recién hecho con agua caliente.', 25.00, 'bebidas', 'Bebidas/Cafe Americano.jpg', '🥤'],
            ['b15', 'Café con Leche', 'Café espresso con leche vaporizada.', 30.00, 'bebidas', 'Bebidas/Cafe Con Leche.jpg', '🥤']
        ];
        
        const sql = `INSERT INTO Productos (id_producto, nombre, descripcion, precio, categoria, imagen_url, emoji) VALUES ?`;
        await db.query(sql, [valores]);

        res.send("<h1>¡ÉXITO! 🎉</h1><p>Base de datos poblada.</p>");
    } catch (error) { res.status(500).send(error.message); }
});

app.listen(PUERTO, () => {
    console.log(`Servidor corriendo en puerto ${PUERTO}`);
});
