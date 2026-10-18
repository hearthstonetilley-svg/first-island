import { SimulationClient } from '../sim/client';
import { Dials, Snapshot, Speed } from '../sim/types';

export class SimulationHUD {
  readonly element = document.createElement('aside');
  private readonly clock: HTMLElement;
  private readonly generation: HTMLElement;
  private readonly status: HTMLElement;
  private dialsInitialized = false;
  constructor(parent: HTMLElement, simulation: SimulationClient) {
    this.element.className = 'simulation-hud';
    this.element.setAttribute('aria-label', 'Simulation controls');
    this.element.innerHTML = `<div class="sim-stats"><span class="sim-population"></span><span class="sim-generation">Generation 1</span><time>00:00:00</time><span class="sim-status">Simulation preparing</span></div>
      <div class="sim-speeds" role="group" aria-label="Simulation speed">${([0,1,10,100] as Speed[]).map(speed => `<button type="button" data-speed="${speed}" aria-pressed="${speed===1}">${speed===0?'Pause':`${speed}×`}</button>`).join('')}</div>
      <button class="sim-export" type="button">Export run</button>
      <details class="sim-dials"><summary>Dials</summary><form>
      <label>Generation (seconds)<input name="generationSeconds" type="number" min="60" max="86400" step="1" required></label>
      <label>Food regrowth<input name="foodRegrowth" type="number" min="0" max="10" step="0.1" required></label>
      <label>Mutation rate<input name="mutationRate" type="number" min="0" max="0.5" step="0.01" required></label>
      <label>Starting population<input name="startingPopulation" type="number" min="0" max="200" step="1" required></label>
      <p>Starting population applies to a new run.</p><button type="submit">Apply to this run</button><button class="sim-new-run" type="button">New run</button><p class="sim-dial-message" role="status"></p>
      </form></details>`;
    parent.append(this.element);
    // Notices clear the actual HUD height, including responsive wrapped rows.
    const resize = new ResizeObserver(() => {
      parent.style.setProperty('--simulation-hud-height', `${this.element.getBoundingClientRect().height}px`);
    });
    resize.observe(this.element);
    window.addEventListener('pagehide', () => resize.disconnect(), { once: true });
    this.clock = this.element.querySelector('time')!;
    this.generation = this.element.querySelector('.sim-generation')!;
    this.status = this.element.querySelector('.sim-status')!;
    this.element.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(button => {
      button.onclick = () => simulation.intervene({ speed: Number(button.dataset.speed) as Speed });
    });
    const form = this.element.querySelector('form')!;
    const readDials = (): Partial<Dials> => Object.fromEntries([...new FormData(form)].map(([key,value])=>[key,Number(value)]));
    form.onsubmit = event => {
      event.preventDefault();
      const { startingPopulation: _initial, ...dials } = readDials();
      simulation.intervene({ dials });
      this.element.querySelector('.sim-dial-message')!.textContent = 'Applied and recorded in the run log.';
    };
    this.element.querySelector<HTMLButtonElement>('.sim-new-run')!.onclick = () => {
      if (!form.reportValidity()) return;
      const url = new URL(location.href);
      for (const [key,value] of Object.entries(readDials())) url.searchParams.set(key,String(value));
      location.href = url.href;
    };
    this.element.querySelector<HTMLButtonElement>('.sim-export')!.onclick = async () => {
      const record = await simulation.record();
      const url = URL.createObjectURL(new Blob([JSON.stringify(record)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `island-${record.seed}-tick-${record.ticks}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }
  update(snapshot: Snapshot): void {
    if (!this.dialsInitialized) {
      for (const [key,value] of Object.entries(snapshot.dials)) {
        const input = this.element.querySelector<HTMLInputElement>(`input[name="${key}"]`);
        if (input) input.value = String(value);
      }
      this.dialsInitialized = true;
    }
    const seconds = snapshot.seconds;
    this.element.querySelector('.sim-population')!.textContent = `Population ${snapshot.stats.population} · Born ${snapshot.stats.births} · Died ${snapshot.stats.deaths}`;
    this.clock.textContent = [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
    this.generation.textContent = `Generation ${snapshot.generation}`;
    this.status.textContent = `${snapshot.speed === 0 ? 'Paused' : `${snapshot.speed}×`} · ${snapshot.eventCount} events`;
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-speed]')) button.setAttribute('aria-pressed', String(Number(button.dataset.speed)===snapshot.speed));
  }
  fail(message: string): void { this.status.textContent = `Simulation stopped: ${message}`; }
}
