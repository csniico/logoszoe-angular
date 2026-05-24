import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PostService } from '../../core/services/post.service';
import { ConfirmModalService } from '../../shared/confirm-modal/confirm-modal.service';
import { Post } from '../../core/models/post.model';

type PostFilter = 'all' | 'top-level' | 'replies' | 'anonymous';

@Component({
  selector: 'app-community',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './community.html',
  styleUrl: './community.scss',
})
export class CommunityComponent implements OnInit {
  private readonly postService  = inject(PostService);
  private readonly confirmModal = inject(ConfirmModalService);

  readonly posts        = signal<Post[]>([]);
  readonly loading      = signal(true);
  readonly error        = signal<string | null>(null);
  readonly searchQuery  = signal('');
  readonly filterType   = signal<PostFilter>('all');
  readonly selectedPost = signal<Post | null>(null);
  readonly deleting     = signal<string | null>(null);

  readonly displayed = computed<Post[]>(() => {
    const q      = this.searchQuery().toLowerCase().trim();
    const filter = this.filterType();

    let list = this.posts();

    if (q) {
      list = list.filter((p) => p.text.toLowerCase().includes(q));
    }

    if (filter === 'top-level') list = list.filter((p) => p.parentId === null);
    if (filter === 'replies')   list = list.filter((p) => p.parentId !== null);
    if (filter === 'anonymous') list = list.filter((p) => p.anonymous);

    return list;
  });

  ngOnInit(): void {
    this.postService.getFeed().subscribe({
      next:  (data) => { this.posts.set(data); this.loading.set(false); },
      error: ()     => { this.error.set('Failed to load community posts.'); this.loading.set(false); },
    });
  }

  view(post: Post): void {
    this.selectedPost.set(post);
  }

  closePost(): void {
    this.selectedPost.set(null);
  }

  async delete(id: string): Promise<void> {
    const ok = await this.confirmModal.open({
      intent: 'Delete post?',
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    this.deleting.set(id);
    this.postService.delete(id).subscribe({
      next: () => {
        this.posts.update((list) => list.filter((p) => p._id !== id));
        if (this.selectedPost()?._id === id) this.selectedPost.set(null);
        this.deleting.set(null);
      },
      error: () => {
        alert('Failed to delete post. Please try again.');
        this.deleting.set(null);
      },
    });
  }

  authorInitial(post: Post): string {
    if (post.anonymous || !post.userName) return '?';
    return post.userName.charAt(0).toUpperCase();
  }

  authorLabel(post: Post): string {
    if (post.anonymous) return 'Anonymous';
    return post.userName ?? 'Unknown';
  }

  textPreview(text: string, max = 80): string {
    return text.length > max ? text.slice(0, max) + '…' : text;
  }
}
