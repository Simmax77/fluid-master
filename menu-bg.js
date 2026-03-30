'use strict';

(function () {
    var canvas = document.getElementById('bg-canvas');
    var ctx = canvas.getContext('2d');
    var particles = [];
    var PARTICLE_COUNT = 60;

    function resize() {
        canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
        canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    }

    function createParticle() {
        return {
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            radius: Math.random() * 3 + 1,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            alpha: Math.random() * 0.15 + 0.03,
            hue: 200 + Math.random() * 40
        };
    }

    for (var i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(createParticle());
    }

    function draw() {
        var w = window.innerWidth;
        var h = window.innerHeight;

        ctx.clearRect(0, 0, w, h);

        // Subtle radial vignette
        var grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
        grad.addColorStop(0, 'rgba(15, 15, 20, 0)');
        grad.addColorStop(1, 'rgba(5, 5, 8, 0.6)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < -10) p.x = w + 10;
            if (p.x > w + 10) p.x = -10;
            if (p.y < -10) p.y = h + 10;
            if (p.y > h + 10) p.y = -10;

            ctx.beginPath();
            var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3);
            g.addColorStop(0, 'hsla(' + p.hue + ', 80%, 60%, ' + p.alpha + ')');
            g.addColorStop(1, 'hsla(' + p.hue + ', 80%, 60%, 0)');
            ctx.fillStyle = g;
            ctx.arc(p.x, p.y, p.radius * 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Connection lines
        ctx.strokeStyle = 'rgba(0, 122, 255, 0.03)';
        ctx.lineWidth = 0.5;
        for (var i = 0; i < particles.length; i++) {
            for (var j = i + 1; j < particles.length; j++) {
                var dx = particles[i].x - particles[j].x;
                var dy = particles[i].y - particles[j].y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 150) {
                    ctx.globalAlpha = (1 - dist / 150) * 0.15;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
        ctx.globalAlpha = 1;

        requestAnimationFrame(draw);
    }

    window.addEventListener('resize', function () {
        resize();
    });
    resize();
    draw();
}());
