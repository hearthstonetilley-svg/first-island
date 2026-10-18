export type LoadingStage = 'terrain' | 'trees' | 'renderer' | 'water' | 'post' | 'warmup' | 'settling';
export interface LoadingProgress { stage: LoadingStage; message: string; percent: number }

/** Allow the new status and bar to paint before the next slice of CPU work.
 * The timer also permits startup in a background tab where RAF is suspended. */
export function paintLoading(): Promise<void> {
  return new Promise((resolve) => {
    const fallback = setTimeout(resolve, 100);
    requestAnimationFrame(() => { clearTimeout(fallback); setTimeout(resolve, 0); });
  });
}

export class LoadingScreen {
  readonly element = document.createElement('section');
  private percent = 0;
  private action: (() => void) | undefined;
  private readonly status: HTMLElement;
  private readonly bar: HTMLProgressElement;
  private readonly amount: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly button: HTMLButtonElement;

  constructor(parent: HTMLElement, seed: number) {
    this.element.className = 'loading-screen';
    this.element.dataset.state = 'loading';
    this.element.setAttribute('aria-label', 'Preparing your island');
    this.element.innerHTML = `
      <div class="loading-brand">FIRST ISLAND<span>SEED ${seed}</span></div>
      <div class="loading-content">
        <svg class="loading-mark" viewBox="0 0 120 100" fill="none" aria-hidden="true">
          <path d="M14 73 39 39 50 53 66 19 103 73" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
          <path d="m56 40 10-21 15 30-14-8-7 6M26 70l13-31 11 14" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
          <path d="M9 79c17-8 25 7 43 0s28-4 39 0 17 1 22-2M24 89c12-4 20 4 32 0s22-2 35 1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".5"/>
        </svg>
        <p class="loading-eyebrow">A WORLD FROM A SINGLE SEED</p>
        <h1>Your island is taking shape.</h1>
        <p class="loading-description">Coastlines, forests and an open horizon.</p>
        <div class="loading-meter"><span class="loading-status" role="status" aria-live="polite">Preparing the world</span><span class="loading-percent">0%</span></div>
        <progress class="loading-progress" max="100" value="0" aria-label="Island preparation"></progress>
        <ol class="loading-steps" aria-label="Preparation stages">
          <li data-step="terrain">Terrain</li><li data-step="trees">Forests</li><li data-step="water">Water</li><li data-step="post">Lighting</li><li data-step="settling">Ready</li>
        </ol>
        <p class="loading-detail">Preparing the view before you arrive.</p>
        <button class="loading-action" type="button" hidden>Enter island</button>
      </div>
      <div class="loading-footer">PROCEDURAL WORLD<span>LAND · SEA · SKY</span></div>`;
    parent.append(this.element);
    this.status = this.element.querySelector('.loading-status')!;
    this.bar = this.element.querySelector('progress')!;
    this.amount = this.element.querySelector('.loading-percent')!;
    this.detail = this.element.querySelector('.loading-detail')!;
    this.button = this.element.querySelector('button')!;
    this.button.addEventListener('click', () => this.action?.());
  }

  update(progress: LoadingProgress): void {
    if (['error', 'complete'].includes(this.element.dataset.state ?? '')) return;
    this.percent = Math.max(this.percent, Math.min(99, progress.percent));
    this.bar.value = this.percent;
    this.amount.textContent = `${Math.floor(this.percent)}%`;
    this.status.textContent = progress.message;
    this.element.dataset.stage = progress.stage;
    const order: LoadingStage[] = ['terrain', 'trees', 'renderer', 'water', 'post', 'warmup', 'settling'];
    for (const step of this.element.querySelectorAll<HTMLElement>('[data-step]')) {
      const delta = order.indexOf(progress.stage) - order.indexOf(step.dataset.step as LoadingStage);
      step.dataset.state = delta > 0 ? 'done' : delta === 0 ? 'active' : 'pending';
    }
  }

  limited(fps: number, enter: () => void): void {
    this.element.dataset.state = 'limited';
    this.status.textContent = 'Low frame rate on this device';
    this.detail.textContent = `This device is running at ${Math.round(fps)} fps. You can enter now, or wait for a smoother frame rate.`;
    this.button.hidden = false;
    this.action = enter;
  }

  finish(): void {
    this.bar.value = 100;
    this.amount.textContent = '100%';
    this.status.textContent = 'Your island is ready';
    this.button.hidden = true;
    this.element.dataset.state = 'complete';
    // Let the completed bar paint before starting the CSS crossfade.
    void paintLoading().then(() => {
      this.element.classList.add('is-leaving');
      this.element.setAttribute('aria-hidden', 'true');
      this.element.inert = true;
      setTimeout(() => this.element.remove(), 900);
    });
  }

  fail(message: string): void {
    this.element.dataset.state = 'error';
    this.status.textContent = 'The island could not start';
    this.detail.textContent = message;
    this.bar.hidden = true;
    this.amount.textContent = '';
    this.button.textContent = 'Try again';
    this.button.hidden = false;
    this.action = () => location.reload();
  }
}
