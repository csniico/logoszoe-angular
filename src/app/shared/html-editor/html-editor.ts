import {
  Component, Input, Output, EventEmitter,
  AfterViewInit, OnDestroy, ElementRef, ViewChild, NgZone, inject,
} from '@angular/core';
import { EditorView, basicSetup } from 'codemirror';
import { html } from '@codemirror/lang-html';
import { oneDark } from '@codemirror/theme-one-dark';

@Component({
  selector: 'app-html-editor',
  standalone: true,
  imports: [],
  template: `<div #host class="editor-host"></div>`,
  styles: [`
    :host { display: block; }
    .editor-host {
      border: 1.5px solid #30363d;
      border-radius: 8px;
      overflow: hidden;
    }
    :host ::ng-deep .cm-editor {
      max-height: 400px;
      font-size: 13px;
      font-family: 'Courier New', Courier, monospace;
    }
    :host ::ng-deep .cm-editor.cm-focused { outline: none; }
    :host ::ng-deep .cm-scroller { line-height: 1.65; }
    :host ::ng-deep .cm-gutters { font-size: 11px; }
    :host ::ng-deep .cm-editor.cm-focused .cm-cursor { border-left-color: #4ade80; }
    /* green focus ring matching theme */
    :host ::ng-deep .cm-editor.cm-focused {
      box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.25);
    }
  `],
})
export class HtmlEditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host') host!: ElementRef<HTMLElement>;

  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();

  private readonly zone = inject(NgZone);
  private editorView?: EditorView;

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.editorView = new EditorView({
        doc: this.value,
        extensions: [
          basicSetup,
          html(),
          oneDark,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const value = update.state.doc.toString();
              this.zone.run(() => this.valueChange.emit(value));
            }
          }),
        ],
        parent: this.host.nativeElement,
      });
    });
  }

  ngOnDestroy(): void {
    this.editorView?.destroy();
  }
}
