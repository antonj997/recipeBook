import { downloadRecipePhoto } from './recipe-photo';

export function downloadStepPhoto(url: string): Promise<string> {
  return downloadRecipePhoto(url, 800);
}
