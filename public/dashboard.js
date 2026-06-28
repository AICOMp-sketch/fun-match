// Load stats from browser storage
function loadStats() {
  const highScore = localStorage.getItem('highScore') || 0;
  const gamesPlayed = localStorage.getItem('gamesPlayed') || 0;
  const totalTime = localStorage.getItem('totalTime') || 0;

  document.getElementById('high-score').textContent = highScore + 's';
  document.getElementById('games-played').textContent = gamesPlayed;
  document.getElementById('total-time').textContent = Math.floor(totalTime / 60) + 'm';
}

// Copy controller link to clipboard
function copyLink() {
  const link = 'https://fun-match.pages.dev/controller.html';
  navigator.clipboard.writeText(link).then(() => {
    const btn = document.querySelector('.copy-btn');
    const original = btn.textContent;
    btn.textContent = '✓ Copied!';
    btn.style.background = 'var(--accent-green)';
    setTimeout(() => {
      btn.textContent = original;
      btn.style.background = 'var(--accent-cyan)';
    }, 2000);
  });
}

// Sidebar nav active state
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Coming soon cards
document.querySelectorAll('.game-card.coming').forEach(card => {
  card.addEventListener('click', (e) => {
    e.preventDefault();
    alert('🚀 Coming soon! This game is under development.');
  });
});

// Initialize
loadStats();