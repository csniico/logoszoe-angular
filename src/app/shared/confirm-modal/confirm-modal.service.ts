import { Injectable, signal } from '@angular/core';

export interface ConfirmConfig {
  /** Short action summary shown as the modal heading — e.g. "Delete 'Discipleship'?" */
  intent: string;
  /** One or two sentences explaining what will happen — shown below the heading. */
  description: string;
  /** Label for the confirm button. Defaults to "Continue". */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /**
   * `'danger'` → red confirm button (destructive actions like delete).
   * `'default'` → primary colour confirm button.
   */
  variant?: 'danger' | 'default';
}

@Injectable({ providedIn: 'root' })
export class ConfirmModalService {
  /** Null when modal is closed; populated with config when open. */
  readonly config = signal<ConfirmConfig | null>(null);

  private pendingResolvers: ((confirmed: boolean) => void)[] = [];

  /**
   * Open the confirmation modal.
   * Returns a Promise that resolves to `true` if the user confirmed,
   * or `false` if they cancelled / dismissed.
   */
  open(config: ConfirmConfig): Promise<boolean> {
    this.config.set(config);
    return new Promise<boolean>((resolve) => {
      this.pendingResolvers.push(resolve);
    });
  }

  /** Called by the modal component when the user clicks the confirm button. */
  confirm(): void {
    this.resolve(true);
  }

  /** Called by the modal component when the user cancels or clicks the backdrop. */
  cancel(): void {
    this.resolve(false);
  }

  private resolve(confirmed: boolean): void {
    this.config.set(null);
    for (const r of this.pendingResolvers) r(confirmed);
    this.pendingResolvers = [];
  }
}
