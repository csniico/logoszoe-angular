import {
  Component,
  ElementRef,
  HostListener,
  Input,
  ViewChild,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Custom-controls HTML5 player for uploaded course videos.
 * (YouTube videos keep their own embedded player for ToS compliance.)
 */
@Component({
  selector: 'app-course-video-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './course-video-player.html',
  styleUrl: './course-video-player.scss',
})
export class CourseVideoPlayerComponent {
  @Input({ required: true }) src!: string;
  @Input() poster?: string;

  @ViewChild('video') private videoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('wrap') private wrapRef?: ElementRef<HTMLDivElement>;

  readonly playing = signal(false);
  readonly current = signal(0);
  readonly duration = signal(0);
  readonly volume = signal(1);
  readonly muted = signal(false);
  readonly buffering = signal(false);
  readonly fullscreen = signal(false);
  readonly showControls = signal(true);

  private hideTimer?: ReturnType<typeof setTimeout>;

  private get v(): HTMLVideoElement | undefined {
    return this.videoRef?.nativeElement;
  }

  @HostListener('document:fullscreenchange')
  onFsChange(): void {
    this.fullscreen.set(!!document.fullscreenElement);
  }

  reveal(): void {
    this.showControls.set(true);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      if (this.v && !this.v.paused) this.showControls.set(false);
    }, 2600);
  }

  toggle(): void {
    const v = this.v;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
    this.reveal();
  }

  seek(e: Event): void {
    const v = this.v;
    if (!v) return;
    const t = Number((e.target as HTMLInputElement).value);
    v.currentTime = t;
    this.current.set(t);
  }

  skip(delta: number): void {
    const v = this.v;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
    this.reveal();
  }

  toggleMute(): void {
    const v = this.v;
    if (!v) return;
    v.muted = !v.muted;
    this.muted.set(v.muted);
  }

  changeVolume(e: Event): void {
    const v = this.v;
    if (!v) return;
    const val = Number((e.target as HTMLInputElement).value);
    v.volume = val;
    v.muted = val === 0;
    this.volume.set(val);
    this.muted.set(val === 0);
  }

  toggleFullscreen(): void {
    const el = this.wrapRef?.nativeElement;
    if (!el) return;
    if (!document.fullscreenElement) void el.requestFullscreen?.();
    else void document.exitFullscreen?.();
  }

  // ── Media element events ──
  onPlay(): void { this.playing.set(true); this.reveal(); }
  onPause(): void { this.playing.set(false); this.showControls.set(true); }
  onTime(): void { this.current.set(this.v?.currentTime ?? 0); }
  onMeta(): void { this.duration.set(this.v?.duration ?? 0); }
  onWaiting(): void { this.buffering.set(true); }
  onPlayingEvt(): void { this.buffering.set(false); }
  onEnded(): void { this.playing.set(false); this.showControls.set(true); }

  fmt(s: number): string {
    if (!isFinite(s) || isNaN(s)) return '0:00';
    const total = Math.floor(s);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const mm = h > 0 ? m.toString().padStart(2, '0') : `${m}`;
    return `${h > 0 ? `${h}:` : ''}${mm}:${sec.toString().padStart(2, '0')}`;
  }

  get seekPct(): number {
    return this.duration() > 0 ? (this.current() / this.duration()) * 100 : 0;
  }
  get volPct(): number {
    return this.muted() ? 0 : this.volume() * 100;
  }
}
