//======================================================================
// 1. ESTADO DE LA APLICACIÓN
//======================================================================
let cart = JSON.parse(localStorage.getItem('carrito')) || [];
let isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
let todosLosProductos = []; 

//======================================================================
// 2. FUNCIONES AUXILIARES
//======================================================================

function normalizeText(text) {
    if (typeof text !== 'string') return '';
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Maneja las rutas de las imágenes.
 * CAMBIO: Ahora usa rutas relativas para producción.
 */
function obtenerUrlImagen(ruta) {
    if (!ruta) return 'imagenes/perfil-default.png';
    
    // Si ya es una URL completa (http) o base64 (data:), usarla tal cual
    if (ruta.startsWith('http') || ruta.startsWith('data:')) {
        return ruta;
    }
    
    // Si es una ruta del servidor (uploads/), usar ruta relativa con barra inicial
    if (ruta.startsWith('uploads/')) {
        return `/${ruta.replace(/\\/g, "/")}`; 
    }
    
    // Si es local del front (imagenes/), devolver tal cual
    return ruta;
}

//======================================================================
// 3. FUNCIONES DEL CARRITO
//======================================================================

function updateCartUI() {
    const cartItemsEl = document.getElementById('cartItems');
    const cartTotalEl = document.getElementById('cartTotal');
    const cartCountEl = document.getElementById('cartCount');
    
    if (!cartItemsEl || !cartTotalEl || !cartCountEl) return;

    cartItemsEl.innerHTML = '';
    let total = 0;
    let totalCount = 0;
    
    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        totalCount += item.quantity;
        const cartItemEl = document.createElement('div');
        cartItemEl.className = 'cart-item';
        cartItemEl.innerHTML = `
            <div class="cart-item-img">${item.emoji || '📦'}</div>
            <div class="cart-item-info">
                <div class="cart-item-title">${item.name}</div>
                <div class="cart-item-price">$${item.price.toFixed(2)}</div>
                <div class="cart-item-quantity">
                    <button class="quantity-btn decrease" data-id="${item.id}">-</button>
                    <span class="quantity">${item.quantity}</span>
                    <button class="quantity-btn increase" data-id="${item.id}">+</button>
                    <button class="quantity-btn remove" data-id="${item.id}" style="margin-left:10px; background:#ff4444; color:white;">🗑️</button>
                </div>
            </div>
        `;
        cartItemsEl.appendChild(cartItemEl);
    });
    
    cartTotalEl.textContent = `$${total.toFixed(2)}`;
    cartCountEl.textContent = totalCount;
    cartCountEl.style.display = totalCount > 0 ? 'flex' : 'none';
    
    localStorage.setItem('carrito', JSON.stringify(cart));
}

function addToCart(id, name, price, emoji = '📦') {
    const existingItem = cart.find(item => item.id === id);
    if (existingItem) {
        existingItem.quantity++;
    } else {
        const numericPrice = parseFloat(price);
        if (isNaN(numericPrice)) return;
        cart.push({ id, name, price: numericPrice, quantity: 1, emoji });
    }
    updateCartUI();
}

//======================================================================
// 4. FUNCIONES DE UI
//======================================================================

function updateLoginUI() {
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userProfileWidget = document.getElementById('userProfileWidget');
    const navProfilePic = document.getElementById('navProfilePic');
    const navUserName = document.getElementById('navUserName');

    if (!loginBtn || !logoutBtn || !userProfileWidget || !navProfilePic || !navUserName) return; 

    if (isLoggedIn && currentUser) {
        loginBtn.style.display = 'none';
        userProfileWidget.style.display = 'flex';
        logoutBtn.style.display = 'inline-block';
        
        navUserName.textContent = currentUser.name.split(' ')[0]; 
        navProfilePic.src = obtenerUrlImagen(currentUser.profilePic);
    } else {
        loginBtn.style.display = 'inline-block';
        userProfileWidget.style.display = 'none';
        logoutBtn.style.display = 'none';
    }
}

function enableDarkMode() {
    const darkModeBtn = document.getElementById('darkModeBtn');
    document.body.classList.add('dark-mode');
    localStorage.setItem('darkMode', 'enabled');
    if(darkModeBtn) darkModeBtn.textContent = '☀️ Modo Claro';
}

function disableDarkMode() {
    const darkModeBtn = document.getElementById('darkModeBtn');
    document.body.classList.remove('dark-mode');
    localStorage.setItem('darkMode', 'disabled');
    if(darkModeBtn) darkModeBtn.textContent = '🌙 Modo Oscuro';
}

function cargarMenu(productos) {
    const menuGrid = document.getElementById('menuGrid');
    if (!menuGrid) return;
    menuGrid.innerHTML = ''; 
    productos.forEach(producto => {
        const item = document.createElement('div');
        item.className = 'menu-item';
        item.dataset.category = producto.categoria; 
        
        // Las URLs ya vienen relativas o absolutas desde el servidor, 
        // pero nos aseguramos de que si son relativas funcionen bien
        item.innerHTML = `
            <img src="${producto.imagen_url}" alt="${producto.nombre}" class="menu-item-img">
            <div class="menu-item-info">
                <h3 class="menu-item-title">${producto.nombre}</h3>
                <p class="menu-item-desc">${producto.descripcion}</p>
                <div class="menu-item-bottom">
                    <div class="menu-item-price">$${Number(producto.precio).toFixed(2)}</div>
                    <button class="add-to-cart" 
                        data-id="${producto.id_producto}" 
                        data-name="${producto.nombre}" 
                        data-price="${producto.precio}" 
                        data-emoji="${producto.emoji}">+</button>
                </div>
            </div>
        `;
        menuGrid.appendChild(item);
    });
}

async function fetchProductos() {
    const menuGrid = document.getElementById('menuGrid');
    if (!menuGrid) return; 
    try {
        // CAMBIO: Ruta relativa
        const respuesta = await fetch('/productos');
        if (!respuesta.ok) throw new Error(`Error del servidor: ${respuesta.status}`);
        todosLosProductos = await respuesta.json(); 
        cargarMenu(todosLosProductos); 
    } catch (error) {
        console.error('Error al cargar productos:', error);
        menuGrid.innerHTML = `<p style="color: red; text-align: center; grid-column: 1 / -1;">Error al cargar el menú.</p>`;
    }
}

//======================================================================
// 5. ASIGNACIÓN DE EVENTOS
//======================================================================

document.addEventListener('DOMContentLoaded', () => {

    // --- BUSCADOR ---
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const menuSection = document.getElementById('menuSection');

    function filterMenuItems(query) {
        const normalizedQuery = normalizeText(query.trim());
        const activeCategoryBtn = document.querySelector('.category-btn.active');
        const activeCategory = activeCategoryBtn ? activeCategoryBtn.dataset.category : 'all';

        const productosFiltrados = todosLosProductos.filter(producto => {
            const title = normalizeText(producto.nombre);
            const itemCategory = producto.categoria;
            const categoryMatch = (activeCategory === 'all' || itemCategory === activeCategory);
            const searchMatch = title.includes(normalizedQuery);
            return categoryMatch && searchMatch;
        });
        cargarMenu(productosFiltrados);
    }

    if (searchBtn && searchInput && menuSection) {
        searchBtn.addEventListener('click', () => {
            filterMenuItems(searchInput.value);
            menuSection.scrollIntoView({ behavior: 'smooth' });
        });
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                filterMenuItems(searchInput.value);
                menuSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    // --- CATEGORÍAS ---
    const categoryButtons = document.querySelectorAll('.category-btn');
    if (categoryButtons.length > 0 && searchInput) {
        categoryButtons.forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                filterMenuItems(searchInput.value); 
            });
        });
    }

    // --- LOGIN / LOGOUT / MODALES ---
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginModal = document.getElementById('loginModal');
    
    if (loginBtn && loginModal && logoutBtn) {
        loginBtn.addEventListener('click', () => { if (!isLoggedIn) loginModal.style.display = 'flex'; });
        
        logoutBtn.addEventListener('click', () => {
            alert('Has cerrado sesión.');
            isLoggedIn = false;
            currentUser = null;
            localStorage.removeItem('isLoggedIn'); 
            localStorage.removeItem('currentUser'); 
            localStorage.removeItem('pedidos'); 
            updateLoginUI(); 
            if (document.body.id === 'profile-page') window.location.href = 'Con todo y chile 2.html';
        });

        const closeLoginModal = document.getElementById('closeLoginModal');
        const tabButtons = document.querySelectorAll('.tab-btn');
        const formContents = document.querySelectorAll('.form-content');
        const loginSubmitBtn = document.getElementById('loginSubmitBtn');
        const registerSubmitBtn = document.getElementById('registerSubmitBtn');
        
        closeLoginModal.addEventListener('click', () => { loginModal.style.display = 'none'; });
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                tabButtons.forEach(btn => btn.classList.remove('active'));
                formContents.forEach(form => form.classList.remove('active'));
                button.classList.add('active');
                document.getElementById(button.dataset.form).classList.add('active');
            });
        });

        // LOGIN
        loginSubmitBtn.addEventListener('click', async () => {
            const email = document.getElementById('loginEmail').value;
            const contrasena = document.getElementById('loginPass').value;
            if (email === '' || contrasena === '') return alert('Por favor, rellena todos los campos.');
            try {
                // CAMBIO: Ruta relativa
                const respuesta = await fetch('/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, contrasena })
                });
                const datos = await respuesta.json();
                if (respuesta.ok) {
                    isLoggedIn = true; 
                    currentUser = datos.usuario;
                    localStorage.setItem('isLoggedIn', 'true'); 
                    localStorage.setItem('currentUser', JSON.stringify(currentUser)); 
                    loginModal.style.display = 'none';
                    updateLoginUI(); 
                } else {
                    alert(datos.mensaje);
                }
            } catch (error) { alert('Error al conectar con el servidor.'); }
        });

        // REGISTRO
        registerSubmitBtn.addEventListener('click', async () => {
            const nombre = document.getElementById('regName').value;
            const email = document.getElementById('regEmail').value;
            const contrasena = document.getElementById('regPass').value;
            const telefono = document.getElementById('regTel').value;
            if (nombre === '' || email === '' || contrasena === '') return alert('Campos obligatorios vacíos.');
            try {
                // CAMBIO: Ruta relativa
                const respuesta = await fetch('/registrar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nombre, email, contrasena, telefono })
                });
                const datos = await respuesta.json();
                if (respuesta.ok) { 
                    alert('Registro exitoso. Inicia sesión.');
                    document.querySelector('.tab-btn[data-form="loginForm"]').click();
                    document.getElementById('regName').value = "";
                    document.getElementById('regEmail').value = "";
                    document.getElementById('regPass').value = "";
                    document.getElementById('regTel').value = "";
                } else {
                    alert(datos.mensaje);
                }
            } catch (error) { alert('Error al conectar con el servidor.'); }
        });
    }

    // --- CARRITO ---
    const menuGrid = document.getElementById('menuGrid');
    if (menuGrid) {
        menuGrid.addEventListener('click', (e) => {
            if (e.target.classList.contains('add-to-cart')) {
                const { id, name, price, emoji } = e.target.dataset;
                addToCart(id, name, parseFloat(price), emoji);
            }
        });
    }
    const staticAddButtons = document.querySelectorAll('.promotion-item .add-to-cart');
    if (staticAddButtons.length > 0) {
        staticAddButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const { id, name, price, emoji } = e.target.dataset;
                addToCart(id, name, parseFloat(price), emoji);
            });
        });
    }

    const cartIcon = document.getElementById('cartIcon');
    const cartSidebar = document.getElementById('cartSidebar');
    const closeCartBtn = document.getElementById('closeCartBtn');
    const cartItemsEl = document.getElementById('cartItems');
    const checkoutBtn = cartSidebar ? cartSidebar.querySelector('.checkout-btn') : null;

    if (cartIcon) {
        cartIcon.addEventListener('click', () => cartSidebar.classList.add('open'));
        closeCartBtn.addEventListener('click', () => cartSidebar.classList.remove('open'));
        cartItemsEl.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            if (!id) return;
            const idx = cart.findIndex(item => item.id == id);
            if (idx === -1) return;
            if (e.target.classList.contains('increase')) cart[idx].quantity++;
            else if (e.target.classList.contains('decrease')) {
                if (cart[idx].quantity > 1) cart[idx].quantity--;
                else cart.splice(idx, 1);
            } else if (e.target.classList.contains('remove')) cart.splice(idx, 1);
            updateCartUI();
        });

        // FINALIZAR PEDIDO
        checkoutBtn.addEventListener('click', async () => {
            if (cart.length === 0) return alert('Carrito vacío.');
            if (isLoggedIn && currentUser) {
                try {
                    // CAMBIO: Ruta relativa
                    const respuesta = await fetch('/crear-pedido', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id_usuario: currentUser.id, items: cart })
                    });
                    const datos = await respuesta.json();
                    if (respuesta.ok) {
                        alert(`¡Pedido #${datos.id_pedido} registrado!`);
                        cart = []; 
                        updateCartUI(); 
                        cartSidebar.classList.remove('open'); 
                    } else {
                        alert(datos.mensaje);
                    }
                } catch (error) { alert('Error al procesar pedido.'); }
            } else {
                alert('Inicia sesión para pedir.');
                if (loginModal) loginModal.style.display = 'flex';
            }
        });
    }

    // --- MODAL NOSOTROS ---
    const nosotrosLink = document.getElementById('nosotrosLink');
    const nosotrosModal = document.getElementById('nosotrosModal');
    const closeNosotrosModal = document.getElementById('closeNosotrosModal');
    if (nosotrosLink) {
        nosotrosLink.addEventListener('click', (e) => { e.preventDefault(); nosotrosModal.style.display = 'flex'; });
        closeNosotrosModal.addEventListener('click', () => nosotrosModal.style.display = 'none');
        window.addEventListener('click', (e) => {
            if (e.target === nosotrosModal) nosotrosModal.style.display = 'none';
            if (loginModal && e.target === loginModal) loginModal.style.display = 'none';
        });
    }

    // --- MODO OSCURO ---
    const darkModeBtn = document.getElementById('darkModeBtn');
    if (darkModeBtn) { 
        if (localStorage.getItem('darkMode') === 'enabled' || (window.matchMedia('(prefers-color-scheme: dark)').matches && !localStorage.getItem('darkMode'))) {
            enableDarkMode();
        }
        darkModeBtn.addEventListener('click', () => {
            document.body.classList.contains('dark-mode') ? disableDarkMode() : enableDarkMode();
        });
    }

    // === LÓGICA DE PERFIL ===
    if (document.body.id === 'profile-page') {
        if (!isLoggedIn || !currentUser) {
            alert('Inicia sesión primero.');
            window.location.href = 'Con todo y chile 2.html'; 
            return;
        }

        const sidebarProfilePic = document.getElementById('sidebarProfilePic');
        const profileName = document.getElementById('profileName');
        const welcomeProfileName = document.getElementById('welcomeProfileName');
        const sidebarProfileName = document.getElementById('sidebarProfileName');
        const profileEmail = document.getElementById('profileEmail');
        const profileAddress = document.getElementById('profileAddress');
        const profilePhone = document.getElementById('profilePhone');
        const profilePicInput = document.getElementById('profilePicInput');
        const saveProfileBtn = document.getElementById('saveProfileBtn');
        const cancelEditBtn = document.getElementById('cancelEditBtn');
        const orderHistoryContainer = document.getElementById('orderHistoryContainer');
        const sidebarButtons = document.querySelectorAll('.profile-nav-btn');
        const contentViews = document.querySelectorAll('.profile-content-view');
        const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');

        function switchView(viewId) {
            contentViews.forEach(view => view.classList.remove('active'));
            sidebarButtons.forEach(btn => btn.classList.remove('active'));
            const viewToShow = document.getElementById(viewId);
            const buttonToActivate = document.querySelector(`.profile-nav-btn[data-view="${viewId}"]`);
            if(viewToShow) viewToShow.classList.add('active');
            if(buttonToActivate) buttonToActivate.classList.add('active');
        }

        function loadProfileData() {
            sidebarProfilePic.src = obtenerUrlImagen(currentUser.profilePic);
            if(document.getElementById('mainProfilePic')) document.getElementById('mainProfilePic').src = obtenerUrlImagen(currentUser.profilePic);
            
            if(profileName) profileName.textContent = currentUser.name;
            if(welcomeProfileName) welcomeProfileName.textContent = currentUser.name.split(' ')[0]; 
            if(sidebarProfileName) sidebarProfileName.textContent = currentUser.name;
            if(profileEmail) profileEmail.textContent = currentUser.email;
            if(profileAddress) profileAddress.textContent = currentUser.address || "Sin dirección.";
            if(profilePhone) profilePhone.textContent = currentUser.phone || "Sin teléfono.";
            
            document.getElementById('editName').value = currentUser.name;
            document.getElementById('editEmail').value = currentUser.email;
            document.getElementById('editAddress').value = currentUser.address || "";
            document.getElementById('editTel').value = currentUser.phone || "";
        }

        async function loadOrderHistory() {
            orderHistoryContainer.innerHTML = '<p id="no-orders-msg">Cargando...</p>';
            try {
                // CAMBIO: Ruta relativa
                const respuesta = await fetch(`/mis-pedidos/${currentUser.id}`);
                const pedidos = await respuesta.json();
                orderHistoryContainer.innerHTML = ''; 
                if (pedidos.length === 0) {
                    orderHistoryContainer.innerHTML = '<p id="no-orders-msg">Sin pedidos.</p>';
                } else {
                    pedidos.forEach(order => {
                        const orderEl = document.createElement('div');
                        orderEl.className = 'order-item';
                        const itemsHtml = order.items.map(item => `<p>${item.cantidad}x ${item.nombre} (@ $${Number(item.precio_unitario).toFixed(2)})</p>`).join('');
                        const orderDate = new Date(order.fecha_pedido).toLocaleDateString('es-MX');
                        orderEl.innerHTML = `
                            <div class="order-header"><span>Pedido #${order.id_pedido}</span><span>${orderDate}</span></div>
                            <div class="order-body">${itemsHtml}</div>
                            <div class="order-footer"><strong>Total: $${Number(order.total_pedido).toFixed(2)}</strong></div>
                        `;
                        orderHistoryContainer.appendChild(orderEl);
                    });
                }
            } catch (error) { orderHistoryContainer.innerHTML = '<p style="color:red;">Error al cargar.</p>'; }
        }

        sidebarButtons.forEach(button => {
            if(button.id !== 'sidebarLogoutBtn') {
                button.addEventListener('click', (e) => {
                    e.preventDefault(); 
                    switchView(button.dataset.view);
                    if (button.dataset.view === 'pedidos-view') loadOrderHistory();
                });
            }
        });

        if(sidebarLogoutBtn) sidebarLogoutBtn.addEventListener('click', () => logoutBtn.click());
        if(document.getElementById('editProfileBtnNav')) document.getElementById('editProfileBtnNav').addEventListener('click', (e) => { e.preventDefault(); switchView('editar-view'); });
        if(cancelEditBtn) cancelEditBtn.addEventListener('click', (e) => { e.preventDefault(); loadProfileData(); switchView('perfil-view'); });

        if(saveProfileBtn) {
            saveProfileBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const nombre = document.getElementById('editName').value;
                const direccion = document.getElementById('editAddress').value;
                const telefono = document.getElementById('editTel').value;

                try {
                    // CAMBIO: Ruta relativa
                    const respuesta = await fetch('/actualizar-perfil', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id_usuario: currentUser.id, nombre, direccion, telefono })
                    });
                    if (respuesta.ok) {
                        currentUser.name = nombre;
                        currentUser.address = direccion;
                        currentUser.phone = telefono;
                        localStorage.setItem('currentUser', JSON.stringify(currentUser));
                        loadProfileData(); 
                        updateLoginUI(); 
                        switchView('perfil-view'); 
                        alert('Perfil actualizado.');
                    } else alert('Error al actualizar.');
                } catch(error) { alert('Error de conexión.'); }
            });
        }
        
        if (profilePicInput) {
            profilePicInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const formData = new FormData();
                formData.append('fotoPerfil', file);
                formData.append('id_usuario', currentUser.id);
                try {
                    // CAMBIO: Ruta relativa
                    const respuesta = await fetch('/subir-foto', { method: 'POST', body: formData });
                    const datos = await respuesta.json();
                    if (respuesta.ok) {
                        currentUser.profilePic = datos.nuevaFotoUrl;
                        localStorage.setItem('currentUser', JSON.stringify(currentUser));
                        loadProfileData();
                        updateLoginUI();
                        alert('Foto actualizada.');
                    } else alert(datos.mensaje);
                } catch (error) { alert('Error al subir foto.'); }
            });
        }

        loadProfileData();
        switchView('perfil-view'); 
    }

    // === INICIALIZACIÓN ===
    updateCartUI(); 
    updateLoginUI(); 
    if (document.getElementById('menuGrid')) fetchProductos();
});