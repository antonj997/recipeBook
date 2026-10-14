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
  provideRouter,
  withHashLocation,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { PageTurnService } from './core/services/page-turn.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideServiceWorker(serviceWorkerUrl(), {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
      updateViaCache: 'none',
    }),
    provideAppInitializer(() => inject(CloudCookbookService).initialize()),
    provideRouter(
      routes,
      ...(runtimeConfig.pages ? [withHashLocation()] : []),
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: (info) => inject(PageTurnService).start(info),
      }),
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled',
      }),
    ),
  ],
};
