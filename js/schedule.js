// Training plan, this week's schedule and the four day diet cycle.

function renderTraining() {
  document.getElementById('workoutCards').innerHTML = WORKOUTS.map(([day, title, exercises]) => `<div class="card">
      <span class="pill">${day}</span><h3>${title}</h3>
      <div class="foodlist">${exercises.map(([ex, sets, rest]) => `<div class="fooditem"><div><b>${ex}</b><br><small>Rest ${rest}</small></div><b>${sets}</b></div>`).join('')}</div>
      <p class="note">Warm up 5 to 10 minutes. Leave 2 to 3 reps in reserve on every set.</p>
    </div>`).join('');
}

function renderSchedule() {
  const now = today();
  const weekday = (new Date(now + 'T12:00:00Z').getUTCDay() + 6) % 7; // Mon = 0
  const monday = addDays(now, -weekday);
  document.getElementById('weekDays').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i), [, m, d] = date.split('-').map(Number);
    return `<div class="day ${date === now ? 'today' : ''}">
        <strong>${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}</strong><small>${d}/${m}</small>
        <div style="margin-top:10px">${DIET_ICONS[cycle(date)]}</div>
        <small>${GYM_WEEKDAYS.includes(i) ? '🏋️ Gym' : '👟 Walk'}</small>
      </div>`;
  }).join('');
  document.getElementById('dietCycle').innerHTML = DIET.map((name, i) => `<div class="card">
      <span class="pill">Day ${i + 1}</span><h3>${DIET_ICONS[i]} ${name}</h3><p class="muted">${DIET_NOTES[i]}</p>
    </div>`).join('');
}
