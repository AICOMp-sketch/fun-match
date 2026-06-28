// Load stats from browser storage
function loadStats() {
  const highScore = localStorage.getItem('highScore') || 0;
  const gamesPlayed = localStorage.getItem('gamesPlayed') || 0;
  const totalTime = localStorage.getItem('totalTime') || 0;
  const lastTime = localStorage.getItem('lastGameTime') || 0;

  document.getElementById('high-score').textContent = highScore + 's';
  document.getElementById('games-played').textContent = gamesPlayed;

  const hours = (totalTime / 3600).toFixed(1);
  document.getElementById('total-time').textContent = hours + 'h';

  const minutes = Math.floor(lastTime / 60);
  document.getElementById('last-time').textContent = minutes + ' min';
}

// Copy link to clipboard
function copyLink() {
  const link = 'https://fun-match.pages.dev/controller.html';
  navigator.clipboard.writeText(link).then(() => {
    const btn = document.querySelector('.copy-link-btn');
    const original = btn.innerHTML;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
        <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Copied!
    `;
    btn.style.background = '#2ed573';
    setTimeout(() => {
      btn.innerHTML = original;
      btn.style.background = '';
    }, 2000);
  });
}

// Sidebar navigation
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Disabled cards
document.querySelectorAll('.quick-card.disabled, .game-card-mini:not(.active-card)').forEach(card => {
  card.addEventListener('click', (e) => {
    e.preventDefault();
    // Smooth shake animation
    card.style.animation = 'shake 0.4s';
    setTimeout(() => card.style.animation = '', 400);
  });
});

// Add shake animation
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-5px); }
    75% { transform: translateX(5px); }
  }
`;
document.head.appendChild(style);

// Initialize
loadStats();

// Update stats every 5 seconds (in case user comes back from game)
setInterval(loadStats, 5000);