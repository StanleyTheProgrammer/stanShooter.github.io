// ==========================================
// 1. THREE.JS SETUP
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue
scene.fog = new THREE.Fog(0x87ceeb, 0, 50);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = 1.6; // Player eye level

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// Environment (Floor and Obstacles)
const floorGeo = new THREE.PlaneGeometry(100, 100);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x334433, roughness: 0.8 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// Generate some random blocks for cover
for(let i=0; i<20; i++) {
    const boxGeo = new THREE.BoxGeometry(2, 2, 2);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x777777 });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set((Math.random() - 0.5) * 40, 1, (Math.random() - 0.5) * 40);
    scene.add(box);
}

// Remote Player Mesh
const playerGeo = new THREE.BoxGeometry(1, 2, 1);
const playerMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const remotePlayer = new THREE.Mesh(playerGeo, playerMat);
scene.add(remotePlayer);
remotePlayer.visible = false; // Hide until someone joins

// ==========================================
// 2. CONTROLS & MOVEMENT
// ==========================================
const controls = new THREE.PointerLockControls(camera, document.body);
const crosshair = document.getElementById('crosshair');

// Lock mouse on click (if game started)
document.addEventListener('click', () => {
    if (document.getElementById('ui-container').style.display === 'none') {
        controls.lock();
    }
});

controls.addEventListener('lock', () => crosshair.style.display = 'block');
controls.addEventListener('unlock', () => crosshair.style.display = 'none');

// Movement State
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let prevTime = performance.now();

document.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
    }
});

document.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
    }
});

// ==========================================
// 3. PEER.JS MULTIPLAYER LOGIC
// ==========================================
const peer = new Peer();
let conn = null;

const statusEl = document.getElementById('status');
const myIdEl = document.getElementById('my-id');
const hostBtn = document.getElementById('host-btn');
const joinBtn = document.getElementById('join-btn');
const joinIdInput = document.getElementById('join-id');
const uiContainer = document.getElementById('ui-container');

peer.on('open', (id) => {
    myIdEl.innerText = id;
    statusEl.innerText = "Ready to connect!";
    hostBtn.disabled = false;
    joinBtn.disabled = false;
});

// Hosting
hostBtn.addEventListener('click', () => {
    statusEl.innerText = "Waiting for a player to join...";
    peer.on('connection', (connection) => {
        conn = connection;
        setupConnection();
    });
});

// Joining
joinBtn.addEventListener('click', () => {
    const hostId = joinIdInput.value.trim();
    if (!hostId) return alert("Enter an ID");
    statusEl.innerText = "Connecting...";
    conn = peer.connect(hostId);
    setupConnection();
});

function setupConnection() {
    conn.on('open', () => {
        uiContainer.style.display = 'none'; // Hide menu
        remotePlayer.visible = true;       // Show enemy
        controls.lock();                   // Enter game
    });

    conn.on('data', (data) => {
        if (data.type === 'transform') {
            // Update enemy position based on received data
            remotePlayer.position.set(data.x, data.y, data.z);
        } else if (data.type === 'hit') {
            // We got shot!
            const damageOverlay = document.getElementById('damage-overlay');
            damageOverlay.style.opacity = 0.5;
            setTimeout(() => damageOverlay.style.opacity = 0, 150);
        }
    });

    conn.on('close', () => {
        alert("Opponent disconnected.");
        location.reload();
    });
}

// ==========================================
// 4. SHOOTING LOGIC
// ==========================================
document.addEventListener('mousedown', (e) => {
    if (!controls.isLocked || !conn || !conn.open) return;
    if (e.button !== 0) return; // Only Left click

    // Raycast from center of camera
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    const intersects = raycaster.intersectObject(remotePlayer);

    if (intersects.length > 0) {
        // We hit the remote player! Flash them white locally.
        remotePlayer.material.color.setHex(0xffffff);
        setTimeout(() => remotePlayer.material.color.setHex(0xff0000), 100);
        
        // Tell the other player they got hit
        conn.send({ type: 'hit' });
    }
});

// ==========================================
// 5. GAME LOOP
// ==========================================
function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    if (controls.isLocked) {
        // Physics / Movement
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize(); // Ensure consistent speed in all directions

        const speed = 40.0;
        if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        
        // Lock player to floor height
        camera.position.y = 1.6; 

        // Send our position to the opponent
        if (conn && conn.open) {
            conn.send({
                type: 'transform',
                x: camera.position.x,
                y: camera.position.y - 0.6, // send the center of the mesh, not eye level
                z: camera.position.z
            });
        }
    }

    prevTime = time;
    renderer.render(scene, camera);
}

// Handle window resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
