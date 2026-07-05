(function () {
    'use strict';

    // ═══════════════ AUTO-DETECT BASE PATH ═══════════════
    function getBasePath() {
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].src;
            if (src.includes('global/loader.js')) {
                return src.replace('global/loader.js', '');
            }
        }
        // Fallback: try to figure out from current URL
        const path = window.location.pathname;
        if (path.includes('/auth/')) return '../';  
        if (path.includes('/hub/')) return '../';
        if (path.includes('/games/fighter/')) return '../../';
        if (path.includes('/games/racer/')) return '../../';
        if (path.includes('/games/survive/')) return '../../';
        return '/';
    }

    const BASE = getBasePath();

    const CONFIG = {
        videoPath: BASE + 'videos/Steve-Dancing.webm',
        cssPath: BASE + 'global/loader.css',
        minDisplayTime: 2000,
        maxDisplayTime: 5000
    };

    console.log('🕺 Loader paths:', CONFIG.videoPath, CONFIG.cssPath);

    // ═══════════════ INJECT CSS ═══════════════
    function injectCSS() {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = CONFIG.cssPath;
        document.head.appendChild(link);
    }

    // ═══════════════ CREATE LOADER ═══════════════
    function createLoader() {
        const loader = document.createElement('div');
        loader.id = 'page-loader';
        loader.className = 'page-loader';

        const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.className = 'loader-video';

        const source = document.createElement('source');
        source.src = CONFIG.videoPath;
        source.type = 'video/mp4';

        video.appendChild(source);
        loader.appendChild(video);

        // Error handling
        video.addEventListener('error', function () {
            console.error('❌ Steve video failed to load:', CONFIG.videoPath);
            // Hide loader immediately if video fails
            hideLoader(loader);
        });

        video.addEventListener('loadeddata', function () {
            console.log('✅ Steve video loaded!');
        });

        // Insert at the very beginning of body
        if (document.body) {
            document.body.insertBefore(loader, document.body.firstChild);
            document.body.classList.add('loading');
        }

        // Try to play
        video.play().catch(err => {
            console.log('⚠️ Autoplay prevented:', err);
        });

        return loader;
    }

    // ═══════════════ HIDE LOADER ═══════════════
    function hideLoader(loader) {
        if (!loader || loader.classList.contains('hidden')) return;

        loader.classList.add('hidden');
        document.body.classList.remove('loading');

        setTimeout(() => {
            if (loader.parentNode) {
                loader.remove();
            }
        }, 700);

        console.log('🕺 Steve says goodbye!');
    }

    // ═══════════════ INITIALIZE ═══════════════
    function init() {
        injectCSS();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start);
        } else {
            start();
        }
    }

    function start() {
        const loader = createLoader();
        if (!loader) return;

        const startTime = Date.now();

        console.log('🕺 Steve is dancing!');

        function attemptHide() {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, CONFIG.minDisplayTime - elapsed);

            setTimeout(() => {
                hideLoader(loader);
            }, remaining);
        }

        if (document.readyState === 'complete') {
            attemptHide();
        } else {
            window.addEventListener('load', attemptHide);
        }

        // Failsafe
        setTimeout(() => {
            hideLoader(loader);
        }, CONFIG.maxDisplayTime);
    }

    init();

})();