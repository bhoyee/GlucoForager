import { isDurableRecipeImageUrl } from '../recipeImageCache';

describe('isDurableRecipeImageUrl', () => {
  it('accepts R2 thumbnails and server uploads', () => {
    expect(isDurableRecipeImageUrl('https://pub-77d8.r2.dev/recipethumbnails/abc-512.jpg')).toBe(true);
    expect(isDurableRecipeImageUrl('https://api.glucoforager.com/uploads/recipe-images/x.jpg')).toBe(true);
    expect(isDurableRecipeImageUrl('/uploads/recipe-images/x.jpg')).toBe(true);
  });
  it('rejects placeholders and empty values', () => {
    expect(isDurableRecipeImageUrl('https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800')).toBe(false);
    expect(isDurableRecipeImageUrl('')).toBe(false);
    expect(isDurableRecipeImageUrl('https://example.com/random.jpg')).toBe(false);
  });
});
