import { SimulationClient } from '../sim/client';
import { Snapshot, Speed } from '../sim/types';

export class SimulationHUD {
  readonly element = document.createElement('aside');
  private readonly clock: HTMLElement;
  private readonly generation: HTMLElement;
  private readonly status: HTMLElement;
  constructor(parent: HTMLElement, simulation: SimulationClient) {
    this.element.className = 'simulation-hud';
    this.element.setAttribute('aria-label', 'Simulation controls');
    this.element.innerHTML = `<div class="sim-stats"><span class="sim-generation">Generation 1</span><time>00:00:00</time><span class="sim-status">Simulation preparing</span></div>
      <div class="sim-speeds" role="group" aria-label="Simulation speed">${([0,1,10,100] as Speed[]).map(speed => `<button type="button" data-speed="${speed}" aria-pressed="${speed===1}">${speed===0?'Pause':`${speed}×`}</button>`).join('')}</div>
      <button class="sim-export" type="button">Export run</button>`;
    parent.append(this.element);
    this.clock = this.element.querySelector('time')!;
    this.generation = this.element.querySelector('.sim-generation')!;
    this.status = this.element.querySelector('.sim-status')!;
    this.element.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(button => {
      button.onclick = () => simulation.intervene({ speed: Number(button.dataset.speed) as Speed });
    });
    this.element.querySelector<HTMLButtonElement>('.sim-export')!.onclick = async () => {
      const record = await simulation.record();
      const url = URL.createObjectURL(new Blob([JSON.stringify(record)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `island-${record.seed}-tick-${record.ticks}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }
  update(snapshot: Snapshot): void {
    const seconds = snapshot.seconds;
    this.clock.textContent = [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
    this.generation.textContent = `Generation ${snapshot.generation}`;
    this.status.textContent = `${snapshot.speed === 0 ? 'Paused' : `${snapshot.speed}×`} · ${snapshot.eventCount} events`;
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-speed]')) button.setAttribute('aria-pressed', String(Number(button.dataset.speed)===snapshot.speed));
  }
  fail(message: string): void { this.status.textContent = `Simulation stopped: ${message}`; }
}
