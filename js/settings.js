// Settings: personal targets and JSON backup import/export.

function fillTargets() {
  // Do not overwrite what the user is typing
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#targetsForm')) return;
  document.getElementById('tCal').value = state.calorieTarget;
  document.getElementById('tProtein').value = state.targets.protein;
  document.getElementById('tWater').value = state.targets.water;
  document.getElementById('tSteps').value = state.targets.steps;
}

function fillWorkSettings() {
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#workSettingsForm')) return;
  const ws = state.workSettings;
  document.getElementById('wsJob').value = ws.job;
  document.getElementById('wsHours').value = ws.hoursPerDay;
  document.getElementById('wsTarget').value = ws.weeklyTarget;
  document.getElementById('wsEarliest').value = ws.earliestStart;
  document.getElementById('wsLatest').value = ws.latestStart;
}

function saveWorkSettings(e) {
  e.preventDefault();
  if (parseTime(val('wsLatest')) < parseTime(val('wsEarliest'))) { alert('The latest start must be after the earliest start.'); return; }
  state.workSettings = {
    ...state.workSettings, job: val('wsJob').trim() || WORK_DEFAULTS.job,
    hoursPerDay: Number(val('wsHours')), weeklyTarget: Number(val('wsTarget')),
    earliestStart: val('wsEarliest'), latestStart: val('wsLatest'),
  };
  persist();
  setText('workSettingsStatus', 'Saved ✓ Claude uses these settings too once it syncs.');
  render();
}

function saveTargets(e) {
  e.preventDefault();
  state.calorieTarget = Math.round(Number(val('tCal')));
  state.targets.protein = Math.round(Number(val('tProtein')));
  state.targets.water = Number(val('tWater'));
  state.targets.steps = Math.round(Number(val('tSteps')));
  persist();
  setText('targetStatus', 'Saved ✓ Your dashboard now uses these targets.');
  render();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'forma-data-' + today() + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importData(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (typeof data !== 'object' || !data.foods) throw 0;
      if (!confirm('Replace all data in this browser with the backup?' + (cloud() ? ' The backup will then sync to the cloud.' : ''))) return;
      state = applyDefaults(data);
      persist();
      render();
      setText('targetStatus', 'Backup imported ✓');
    } catch (e) {
      alert('That file is not a valid Forma backup.');
    }
  };
  r.readAsText(file);
}
