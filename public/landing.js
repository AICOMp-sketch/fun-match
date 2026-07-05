// ═══════════════ TIME-BASED VIDEO BACKGROUND ═══════════════

// Wait for everything to load
if (document.readyState === 'complete') {
    setTimeout(hideLoader, 2000); // Show Steve for at least 2 seconds
} else {
    window.addEventListener('load', () => {
        setTimeout(hideLoader, 2000);   
    });
}

// Failsafe: Hide after max 5 seconds
setTimeout(() => {
    const loader = document.getElementById('page-loader');
    if (loader && !loader.classList.contains('hidden')) {
        hideLoader();
    }
}, 5000);

function setTimeBasedVideo() {
    const video = document.getElementById('hero-video');
    const timeIcon = document.getElementById('time-icon');
    const timeText = document.getElementById('time-text');
    const hero = document.querySelector('.hero');

    if (!video) return;

    const hour = new Date().getHours();
    const isMorning = hour >= 6 && hour < 18; // 6 AM to 6 PM

    // Set video source based on time
    const videoSrc = isMorning ? 'videos/Morning.mp4' : 'videos/Night.mp4';

    // Create source element
    const source = document.createElement('source');
    source.src = videoSrc;
    source.type = 'video/mp4';

    // Clear existing sources
    video.innerHTML = '';
    video.appendChild(source);

    // Reload video
    video.load();
    video.play().catch(err => console.log('Autoplay prevented:', err));

    // Add mode class to hero
    if (hero) {
        hero.classList.remove('morning', 'night');
        hero.classList.add(isMorning ? 'morning' : 'night');
    }

    // Update time indicator with detailed greeting
    if (timeIcon && timeText) {
        if (hour >= 5 && hour < 12) {
            timeIcon.textContent = '🌅';
        } else if (hour >= 12 && hour < 17) {
            timeIcon.textContent = '☀️';
        } else if (hour >= 17 && hour < 20) {
            timeIcon.textContent = '🌆';
        } else {
            timeIcon.textContent = '🌙';
        }
    }

    console.log(`🎬 Loaded ${isMorning ? 'Morning' : 'Night'} video (Local time: ${hour}:00)`);
}

// Initialize on page load
setTimeBasedVideo();

// Check every 5 minutes if time period changed (morning ↔ night)
setInterval(() => {
    const hour = new Date().getHours();
    const currentIsMorning = hour >= 6 && hour < 18;
    const video = document.getElementById('hero-video');
    const currentSrc = video?.querySelector('source')?.src || '';
    const videoIsMorning = currentSrc.includes('Morning');

    // Only reload if period changed
    if (currentIsMorning !== videoIsMorning) {
        console.log('⏰ Time period changed, updating video...');
        setTimeBasedVideo();
    }
}, 5 * 60 * 1000); // 5 minutes

// Manual time toggle (optional)
const timeToggle = document.getElementById('time-toggle');
if (timeToggle) {
    timeToggle.addEventListener('click', () => {
        const video = document.getElementById('hero-video');
        const currentSrc = video?.querySelector('source')?.src || '';
        const isMorning = currentSrc.includes('Morning');

        // Toggle to opposite
        const newSrc = isMorning ? 'videos/Night.mp4' : 'videos/Morning.mp4';
        const source = document.createElement('source');
        source.src = newSrc;
        source.type = 'video/mp4';

        video.innerHTML = '';
        video.appendChild(source);
        video.load();
        video.play();

        // Update indicator
        const hero = document.querySelector('.hero');
        const timeIcon = document.getElementById('time-icon');
        const timeText = document.getElementById('time-text');

        hero.classList.remove('morning', 'night');
        hero.classList.add(isMorning ? 'night' : 'morning');

        if (isMorning) {
            timeIcon.textContent = '🌙';
            timeText.textContent = 'Night Mode';
        } else {
            timeIcon.textContent = '🌅';
            timeText.textContent = 'Day Mode';
        }
    });
}

// ═══════════════ NAVIGATION SCROLL EFFECT ═══════════════
const nav = document.querySelector('.nav');
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        nav.classList.add('scrolled');
    } else {
        nav.classList.remove('scrolled');
    }
});

// ═══════════════ FADE-IN ANIMATIONS ═══════════════
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, observerOptions);

// Observe elements
document.querySelectorAll('.step-card, .game-showcase-card, .feature-card, .section-header, .cta-card').forEach(el => {
    el.classList.add('fade-in');
    observer.observe(el);
});

// ═══════════════ SMOOTH SCROLL FOR ANCHORS ═══════════════
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href === '#') return;

        const target = document.querySelector(href);
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// ═══════════════ VISIT TRACKING ═══════════════
// Skip landing if user has visited before (optional)
const hasVisited = localStorage.getItem('funmatch_visited');
if (hasVisited) {
    // You could auto-redirect returning users
    // window.location.href = 'hub/';
}

// Mark as visited when clicking Enter Hub
document.querySelectorAll('a[href="hub/"]').forEach(link => {
    link.addEventListener('click', () => {
        localStorage.setItem('funmatch_visited', 'true');
    });
});

// ═══════════════ 3D PARALLAX EFFECT ═══════════════
let ticking = false;

function updateParallax() {
    const scrollY = window.scrollY;

    document.querySelectorAll('.parallax-layer').forEach(layer => {
        const speed = parseFloat(layer.dataset.speed) || 0.5;
        const section = layer.closest('.parallax-section');

        if (section) {
            const rect = section.getBoundingClientRect();
            const sectionTop = rect.top + scrollY;
            const relativeScroll = scrollY - sectionTop;
            const yOffset = relativeScroll * speed;

            layer.style.transform = `translate3d(0, ${yOffset}px, 0)`;
        }
    });

    ticking = false;
}

window.addEventListener('scroll', () => {
    if (!ticking) {
        window.requestAnimationFrame(updateParallax);
        ticking = true;
    }
});

// ═══════════════ MOUSE PARALLAX ═══════════════
const hero = document.querySelector('.hero');
if (hero) {
    hero.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 20;
        const y = (e.clientY / window.innerHeight - 0.5) * 20;

        const video = document.querySelector('.hero-video');
        if (video) {
            video.style.transform = `scale(1.05) translate(${x * 0.5}px, ${y * 0.5}px)`;
        }

        // Also move device showcase for 3D effect
        const showcase = document.querySelector('.device-showcase');
        if (showcase) {
            showcase.style.transform = `perspective(1000px) rotateY(${x * 0.5}deg) rotateX(${-y * 0.3}deg)`;
        }
    });

    // Reset when mouse leaves
    hero.addEventListener('mouseleave', () => {
        const showcase = document.querySelector('.device-showcase');
        if (showcase) {
            showcase.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg)';
        }
    });
}

// ═══════════════ HAMBURGER MENU ═══════════════
const hamburger = document.getElementById('hamburger');
const sidebarClose = document.getElementById('sidebar-close');
const mobileSidebar = document.getElementById('mobile-sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');

function toggleSidebar() {
    hamburger.classList.toggle('active');
    mobileSidebar.classList.toggle('active');
    sidebarBackdrop.classList.toggle('active');
    document.body.classList.toggle('sidebar-open');
}

function closeSidebar() {
    hamburger.classList.remove('active');
    mobileSidebar.classList.remove('active');
    sidebarBackdrop.classList.remove('active');
    document.body.classList.remove('sidebar-open');
}

if (hamburger) {
    hamburger.addEventListener('click', toggleSidebar);
}

// NEW: Close button inside sidebar
if (sidebarClose) {
    sidebarClose.addEventListener('click', closeSidebar);
}

if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', closeSidebar);
}

// Close sidebar when clicking a link
document.querySelectorAll('.sidebar-link, .sidebar-cta').forEach(link => {
    link.addEventListener('click', closeSidebar);
});

// Close on ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileSidebar?.classList.contains('active')) {
        closeSidebar();
    }
});

// ═══════════════ INTERACTIVE STEP CARDS WITH VIDEO ═══════════════

const stepCards = document.querySelectorAll('.step-card.has-video');

stepCards.forEach(card => {
    const video = card.querySelector('.step-video');
    if (!video) return;

    // Desktop hover
    card.addEventListener('mouseenter', () => {
        if (window.innerWidth > 900) {
            video.currentTime = 0;
            video.play().catch(err => console.log('Video play failed:', err));
        }
    });

    card.addEventListener('mouseleave', () => {
        if (window.innerWidth > 900) {
            video.pause();
        }
    });

    // Mobile click
    card.addEventListener('click', (e) => {
        if (window.innerWidth <= 900) {
            e.preventDefault();

            // If already playing, close it
            if (card.classList.contains('playing')) {
                card.classList.remove('playing');
                video.pause();
            } else {
                // Stop other playing videos
                document.querySelectorAll('.step-card.playing').forEach(otherCard => {
                    otherCard.classList.remove('playing');
                    const otherVideo = otherCard.querySelector('.step-video');
                    if (otherVideo) otherVideo.pause();
                });

                // Play this one
                card.classList.add('playing');
                video.currentTime = 0;
                video.play().catch(err => console.log('Video play failed:', err));
            }
        }
    });
});

// Close video when clicking outside on mobile
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 900) {
        if (!e.target.closest('.step-card')) {
            document.querySelectorAll('.step-card.playing').forEach(card => {
                card.classList.remove('playing');
                const video = card.querySelector('.step-video');
                if (video) video.pause();
            });
        }
    }
});

console.log('🎬 Interactive step cards loaded!');