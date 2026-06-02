import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },

  /* ── Public auth routes ──────────────────────────────── */
  {
    path: 'auth',
    canActivate: [guestGuard],
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/login/login').then((m) => m.LoginComponent),
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./features/auth/register/register').then((m) => m.RegisterComponent),
      },
      {
        path: 'verify',
        loadComponent: () =>
          import('./features/auth/verify/verify').then((m) => m.VerifyComponent),
      },
      { path: '', redirectTo: 'login', pathMatch: 'full' },
    ],
  },

  /* ── Admin shell — persistent sidebar layout ─────────── */
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/shell/shell').then((m) => m.ShellComponent),
    children: [
      /* Dashboard / Analytics */
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard').then((m) => m.DashboardComponent),
      },

      /* Content — Courses */
      {
        path: 'courses',
        loadComponent: () =>
          import('./features/courses/courses').then((m) => m.CoursesComponent),
      },
      {
        path: 'courses/create',
        loadComponent: () =>
          import('./features/courses/create/course-create').then((m) => m.CourseCreateComponent),
      },
      {
        path: 'courses/:id',
        loadComponent: () =>
          import('./features/courses/detail/course-detail').then((m) => m.CourseDetailComponent),
      },
      {
        path: 'course-videos',
        loadComponent: () =>
          import('./features/course-videos/course-videos').then((m) => m.CourseVideosComponent),
      },
      {
        path: 'course-videos/:id',
        loadComponent: () =>
          import('./features/course-videos/detail/course-video-detail').then((m) => m.CourseVideoDetailComponent),
      },

      /* Content — Videos */
      {
        path: 'videos',
        loadComponent: () =>
          import('./features/videos/videos').then((m) => m.VideosComponent),
      },
      {
        path: 'videos/create',
        loadComponent: () =>
          import('./features/videos/create/video-create').then((m) => m.VideoCreateComponent),
      },

      /* Content — Articles */
      {
        path: 'articles',
        loadComponent: () =>
          import('./features/articles/articles').then((m) => m.ArticlesComponent),
      },
      {
        path: 'articles/create',
        loadComponent: () =>
          import('./features/articles/create/article-create').then(
            (m) => m.ArticleCreateComponent,
          ),
      },
      {
        path: 'articles/:slug',
        loadComponent: () =>
          import('./features/articles/detail/article-detail').then(
            (m) => m.ArticleDetailComponent,
          ),
      },

      /* Content — Devotionals */
      {
        path: 'devotionals',
        loadComponent: () =>
          import('./features/devotionals/devotionals').then((m) => m.DevotionalsComponent),
      },
      {
        path: 'devotionals/create',
        loadComponent: () =>
          import('./features/devotionals/create/devotional-create').then(
            (m) => m.DevotionalCreateComponent,
          ),
      },
      {
        path: 'devotionals/:id',
        loadComponent: () =>
          import('./features/devotionals/detail/devotional-detail').then(
            (m) => m.DevotionalDetailComponent,
          ),
      },

      /* Content — Bible (read-only) */
      {
        path: 'bible',
        loadComponent: () =>
          import('./features/bible/bible').then((m) => m.BibleComponent),
      },

      /* Content — Podcasts */
      {
        path: 'podcasts',
        loadComponent: () =>
          import('./features/podcasts/podcasts').then((m) => m.PodcastsComponent),
      },
      {
        path: 'podcasts/create',
        loadComponent: () =>
          import('./features/podcasts/create/podcast-create').then(
            (m) => m.PodcastCreateComponent,
          ),
      },
      {
        path: 'podcasts/:id',
        loadComponent: () =>
          import('./features/podcasts/detail/podcast-detail').then(
            (m) => m.PodcastDetailComponent,
          ),
      },

      /* Community */
      {
        path: 'community',
        loadComponent: () =>
          import('./features/community/community').then((m) => m.CommunityComponent),
      },
      {
        path: 'prayer',
        loadComponent: () =>
          import('./features/prayer/prayer').then((m) => m.PrayerComponent),
      },

      /* Commerce — Shop */
      {
        path: 'shop',
        loadComponent: () =>
          import('./features/shop/shop').then((m) => m.ShopComponent),
      },
      {
        path: 'shop/create',
        loadComponent: () =>
          import('./features/shop/create/product-create').then((m) => m.ProductCreateComponent),
      },
      {
        path: 'shop/:id',
        loadComponent: () =>
          import('./features/shop/detail/product-detail').then((m) => m.ProductDetailComponent),
      },

      /* System — Users */
      {
        path: 'users',
        loadComponent: () =>
          import('./features/users/users').then((m) => m.UsersComponent),
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./features/categories/categories').then((m) => m.CategoriesComponent),
      },
      {
        path: 'categories/create',
        loadComponent: () =>
          import('./features/categories/create/category-create').then(
            (m) => m.CategoryCreateComponent,
          ),
      },
      {
        path: 'categories/:id',
        loadComponent: () =>
          import('./features/categories/detail/category-detail').then(
            (m) => m.CategoryDetailComponent,
          ),
      },
      {
        path: 'storage/migrations',
        loadComponent: () =>
          import('./features/storage/migrations/migration-list').then((m) => m.MigrationListComponent),
      },
      {
        path: 'storage/migration/:id',
        loadComponent: () =>
          import('./features/storage/migration/migration-job').then((m) => m.MigrationJobComponent),
      },
      {
        path: 'storage',
        loadComponent: () =>
          import('./features/storage/storage').then((m) => m.StorageComponent),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile').then((m) => m.ProfileComponent),
      },
      {
        path: 'audit-logs',
        loadComponent: () =>
          import('./features/audit-logs/audit-logs').then((m) => m.AuditLogsComponent),
      },
    ],
  },

  { path: '**', redirectTo: 'dashboard' },
];
