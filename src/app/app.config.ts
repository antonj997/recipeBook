import { serviceWorkerUrl } from './core/service-worker-url';
import { isDevMode } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { runtimeConfig } from './core/runtime-config';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { CloudCookbookService } from './core/services/cloud-cookbook.service';
import {
  TitleStrategy,
  provideRouter,
  withHashLocation,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { PageTransitionService } from './core/services/page-transition.service';
import { routes } from './app.routes';
import { TranslatedTitleStrategy } from './core/i18n/translated-title';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideServiceWorker(serviceWorkerUrl(), {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
      updateViaCache: 'none',
    }),
    provideAppInitializer(() => inject(CloudCookbookService).initialize()),
    { provide: TitleStrategy, useExisting: TranslatedTitleStrategy },
    provideRouter(
      routes,
      ...(runtimeConfig.pages ? [withHashLocation()] : []),
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: (info) => inject(PageTransitionService).start(info),
      }),
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled',
      }),
    ),
  ],
};
