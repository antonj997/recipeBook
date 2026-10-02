import { AfterViewInit, Directive, ElementRef, inject, OnDestroy } from '@angular/core';
import { NgControl } from '@angular/forms';
import type { Subscription } from 'rxjs';

// Keep long recipe text readable as it is typed, loaded or resized.
@Directive({
  selector: 'textarea[appAutoGrow]',
  host: {
    '(input)': 'grow()',
    '[style.overflow-y]': "'hidden'",
    '[style.resize]': "'none'",
    '[style.min-height]': "'0'",
  },
})
export class AutoGrowTextareaDirective implements AfterViewInit, OnDestroy {
  private element = inject<ElementRef<HTMLTextAreaElement>>(ElementRef).nativeElement;
  private control = inject(NgControl, { optional: true });
  private subscription?: Subscription;
  private observer?: ResizeObserver;
  private width = 0;

  ngAfterViewInit(): void {
    this.subscription = this.control?.valueChanges?.subscribe(() => this.grow());
    this.observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === this.width) return;
      this.width = entry.contentRect.width;
      this.grow();
    });
    this.observer.observe(this.element);
    queueMicrotask(() => this.grow());
  }
  grow(): void {
    this.element.style.height = 'auto';
    const border = this.element.offsetHeight - this.element.clientHeight;
    this.element.style.height = this.element.scrollHeight + border + 'px';
  }
  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.observer?.disconnect();
  }
}
