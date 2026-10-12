import { DestroyRef, Directive, ElementRef, NgZone, inject } from '@angular/core';

// The link remains a fixed hit area; only its inner surface rotates.
@Directive({ selector: '[appCardTilt]' })
export class CardTiltDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly motion = window.matchMedia(
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
  );
  private frame = 0;
  private lastTime = 0;
  private pointerX = 0;
  private pointerY = 0;
  private hovering = false;
  private angleX = 0;
  private angleY = 0;

  constructor() {
    const enter = (event: PointerEvent) => this.enter(event);
    const move = (event: PointerEvent) => this.move(event);
    const leave = () => this.reset();
    const preference = () => this.reset(true);
    inject(NgZone).runOutsideAngular(() => {
      this.element.addEventListener('pointerenter', enter);
      this.element.addEventListener('pointermove', move);
      this.element.addEventListener('pointerleave', leave);
      this.element.addEventListener('pointercancel', leave);
      this.element.addEventListener('blur', leave);
      this.motion.addEventListener('change', preference);
    });
    inject(DestroyRef).onDestroy(() => {
      this.reset(true);
      this.element.removeEventListener('pointerenter', enter);
      this.element.removeEventListener('pointermove', move);
      this.element.removeEventListener('pointerleave', leave);
      this.element.removeEventListener('pointercancel', leave);
      this.element.removeEventListener('blur', leave);
      this.motion.removeEventListener('change', preference);
    });
  }
  enter(event: PointerEvent): void {
    this.move(event);
  }
  move(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || !this.motion.matches) return;
    this.hovering = true;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.schedule();
  }
  reset(immediate = false): void {
    this.hovering = false;
    if (immediate || !this.motion.matches) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.angleX = this.angleY = 0;
      this.paint();
      this.element.removeAttribute('data-tilting');
    } else this.schedule();
  }
  private schedule(): void {
    if (this.frame) return;
    this.lastTime = performance.now();
    this.element.setAttribute('data-tilting', '');
    this.frame = requestAnimationFrame((time) => this.tick(time));
  }
  private tick(time: number): void {
    this.frame = 0;
    let targetX = 0;
    let targetY = 0;
    if (this.hovering) {
      const rect = this.element.getBoundingClientRect();
      if (rect.width && rect.height) {
        targetX =
          -6 * Math.max(-1, Math.min(1, ((this.pointerY - rect.top) / rect.height) * 2 - 1));
        targetY = 8 * Math.max(-1, Math.min(1, ((this.pointerX - rect.left) / rect.width) * 2 - 1));
      }
    }
    // A short time-based follow works consistently at 60Hz and higher refresh rates.
    const follow = 1 - Math.exp(-Math.max(0, Math.min(64, time - this.lastTime)) / 45);
    this.lastTime = time;
    this.angleX += (targetX - this.angleX) * follow;
    this.angleY += (targetY - this.angleY) * follow;
    const settled =
      Math.abs(targetX - this.angleX) < 0.01 && Math.abs(targetY - this.angleY) < 0.01;
    if (settled) {
      this.angleX = targetX;
      this.angleY = targetY;
    }
    this.paint();
    if (!settled) this.frame = requestAnimationFrame((next) => this.tick(next));
    else if (!this.hovering) this.element.removeAttribute('data-tilting');
  }
  private paint(): void {
    this.element.style.setProperty('--tilt-x', this.angleX + 'deg');
    this.element.style.setProperty('--tilt-y', this.angleY + 'deg');
  }
}
