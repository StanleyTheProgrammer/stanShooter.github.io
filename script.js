// ==========================================
// 1. THREE.JS SETUP
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 0, 50);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = "YXZ"; 
camera.position.y = 1.6; 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

const floorGeo = new THREE.PlaneGeometry(100, 100);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x334433, roughness: 0.8 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

for(let i=0; i<20; i++) {
    const boxGeo = new THREE.BoxGeometry(2, 2, 2);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x777777 });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set((Math.random() - 0.5) * 40, 1, (Math.random() - 0.5) * 40);
    scene.add(box);
}

const playerGeo = new THREE.BoxGeometry(1, 2, 1);
const playerMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const remotePlayer = new THREE.Mesh(playerGeo, playerMat);
scene.add(remotePlayer);
remotePlayer.visible = false; 

// ==========================================
// 2. STATE & CONTROLS SETUP
// ==========================================
let inGame = false;
let myHealth = 100;
let canJump = true;

const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (isMobile) document.body.classList.add('touch-device');

const controls = new THREE.PointerLockControls(camera, document.body);
const crosshair = document.getElementById('crosshair');
const healthEl = document.getElementById('health-display');

let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let prevTime = performance.now();

// Desktop Locks
document.addEventListener('click', () => {
    if (inGame && !isMobile) controls.lock();
});

controls.addEventListener('lock', () => crosshair.style.display = 'block');
controls.addEventListener('unlock', () => crosshair.style.display = 'none');

// Keyboard mapping
document.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
        case 'Space': 
            if (canJump && inGame) {
                velocity.y = 25.0; // Jump power
                canJump = false;
            }
            break;
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
// 3. MOBILE CONTROLS LOGIC
// ==========================================
let touchX = 0, touchY = 0;
const touchSensitivity = 0.005;

document.addEventListener('touchmove', (e) => {
    if (!inGame || !isMobile) return;
    if (e.touches[0].pageX > window.innerWidth / 2) {
        if (touchX !== 0 && touchY !== 0) {
            const dx = e.touches[0].pageX - touchX;
            const dy = e.touches[0].pageY - touchY;
            camera.rotation.y -= dx * touchSensitivity;
            camera.rotation.x -= dy * touchSensitivity;
            camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, camera.rotation.x));
        }
        touchX = e.touches[0].pageX;
        touchY = e.touches[0].pageY;
    }
}, { passive: false });

document.addEventListener('touchend', () => { touchX = 0; touchY = 0; });

const joystickZone = document.getElementById('joystick-zone');
const stick = document.getElementById('joystick-stick');
let joystickActive = false;

joystickZone.addEventListener('touchstart', () => joystickActive = true);
joystickZone.addEventListener('touchmove', (e) => {
    if (!inGame || !joystickActive) return;
    const touch = e.touches[0];
    const rect = joystickZone.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let dx = touch.pageX - centerX;
    let dy = touch.pageY - centerY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const maxDist = 40;

    if (dist > maxDist) {
        dx *= maxDist / dist;
        dy *= maxDist / dist;
    }

    stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    moveForward = dy < -10;
    moveBackward = dy > 10;
    moveLeft = dx < -10;
    moveRight = dx > 10;
});

joystickZone.addEventListener('touchend', () => {
    joystickActive = false;
    stick.style.transform = `translate(-50%, -50%)`;
    moveForward = moveBackward = moveLeft = moveRight = false;
});

// Mobile Jump Trigger
document.getElementById('mobile-jump').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (canJump && inGame) {
        velocity.y = 25.0; 
        canJump = false;
    }
});


// ==========================================
// 4. MULTIPLAYER & HEALTH LOGIC
// ==========================================
const peer = new Peer();
let conn = null;

const statusEl = document.getElementById('status');
const myIdEl = document.getElementById('my-id');

peer.on('open', (id) => {
    myIdEl.innerText = id;
    statusEl.innerText = "Ready to connect!";
    document.getElementById('host-btn').disabled = false;
    document.getElementById('join-btn').disabled = false;
});

document.getElementById('host-btn').addEventListener('click', () => {
    statusEl.innerText = "Waiting for a player...";
    peer.on('connection', (connection) => { conn = connection; setupConnection(); });
});

document.getElementById('join-btn').addEventListener('click', () => {
    const hostId = document.getElementById('join-id').value.trim();
    if (!hostId) return alert("Enter an ID");
    statusEl.innerText = "Connecting...";
    conn = peer.connect(hostId);
    setupConnection();
});

function setupConnection() {
    conn.on('open', () => {
        document.getElementById('ui-container').style.display = 'none';
        remotePlayer.visible = true;
        inGame = true;
        document.body.classList.add('in-game');
        
        if (!isMobile) controls.lock();
    });

    conn.on('data', (data) => {
        if (data.type === 'transform') {
            remotePlayer.position.set(data.x, data.y, data.z);
        } else if (data.type === 'hit') {
            takeDamage(25); // Taking 25 damage per hit
        }
    });

    conn.on('close', () => {
        alert("Opponent disconnected.");
        location.reload();
    });
}

function takeDamage(amount) {
    myHealth -= amount;
    
    // Flash damage overlay
    const damageOverlay = document.getElementById('damage-overlay');
    damageOverlay.style.opacity = 0.5;
    setTimeout(() => damageOverlay.style.opacity = 0, 150);

    if (myHealth <= 0) {
        alert("You got fragged! Respawning...");
        myHealth = 100;
        
        // Random Respawn Position
        camera.position.set(
            (Math.random() - 0.5) * 30, 
            1.6, 
            (Math.random() - 0.5) * 30
        );
        velocity.set(0,0,0);
    }
    
    // Update UI Color
    healthEl.innerText = `HP: ${myHealth}`;
    healthEl.style.color = myHealth > 50 ? '#28a745' : (myHealth > 25 ? '#ffc107' : '#dc3545');
}

// ==========================================
// 5. SHOOTING LOGIC
// ==========================================
function attemptShoot() {
    if (!inGame || !conn || !conn.open) return;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObject(remotePlayer);

    if (intersects.length > 0) {
        remotePlayer.material.color.setHex(0xffffff);
        setTimeout(() => remotePlayer.material.color.setHex(0xff0000), 100);
        conn.send({ type: 'hit' }); // Tell other player they took damage
    }
}

document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && !isMobile && controls.isLocked) attemptShoot();
});

document.getElementById('mobile-shoot').addEventListener('touchstart', (e) => {
    e.preventDefault(); 
    attemptShoot();
});


// ==========================================
// 6. GAME LOOP
// ==========================================
function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    if (inGame) {
        // Apply Gravity
        velocity.y -= 80.0 * delta; 
        
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize(); 

        const speed = 40.0;
        if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

        if (isMobile) {
            camera.translateX(-velocity.x * delta);
            camera.translateZ(velocity.z * delta); // Inverted fix! Translating by positive velocity.z moves forward correctly
        } else {
            controls.moveRight(-velocity.x * delta);
            controls.moveForward(-velocity.z * delta);
        }
        
        // Vertical movement application
        camera.position.y += velocity.y * delta;

        // Floor Collision
        if (camera.position.y < 1.6) {
            velocity.y = 0;
            camera.position.y = 1.6;
            canJump = true;
        }

        // Network broadcasting
        if (conn && conn.open) {
            conn.send({
                type: 'transform',
                x: camera.position.x,
                y: camera.position.y - 0.6, // Keeps mesh cleanly on ground
                z: camera.position.z
            });
        }
    }

    prevTime = time;
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
