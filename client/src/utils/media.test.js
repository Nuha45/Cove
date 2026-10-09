import { afterEach, describe, expect, it, vi } from 'vitest';
import { mediaUrl } from './media';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('mediaUrl with a relative VITE_API_URL', () => {
  it('keeps frontend product images and upload paths on the current site', () => {
    vi.stubEnv('VITE_API_URL', '/api');
    expect(mediaUrl('/products/candle.jpg')).toBe('/products/candle.jpg');
    expect(mediaUrl('/uploads/products/a/b.jpg')).toBe('/uploads/products/a/b.jpg');
  });
});

describe('mediaUrl with an absolute VITE_API_URL', () => {
  it('still serves frontend product images from the frontend', () => {
    vi.stubEnv('VITE_API_URL', 'https://cove-api-p6ar.onrender.com/api');
    expect(mediaUrl('/products/candle.jpg')).toBe('/products/candle.jpg');
    expect(mediaUrl('/products/mug.jpg')).toBe('/products/mug.jpg');
  });

  it('sends uploaded images to the API server', () => {
    vi.stubEnv('VITE_API_URL', 'https://cove-api-p6ar.onrender.com/api');
    expect(mediaUrl('/uploads/products/a/b.jpg')).toBe('https://cove-api-p6ar.onrender.com/uploads/products/a/b.jpg');
  });
});

describe('mediaUrl for other values', () => {
  it('passes full URLs through and returns an empty string for no image', () => {
    vi.stubEnv('VITE_API_URL', 'https://cove-api-p6ar.onrender.com/api');
    expect(mediaUrl('https://res.cloudinary.com/demo/image.jpg')).toBe('https://res.cloudinary.com/demo/image.jpg');
    expect(mediaUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(mediaUrl('')).toBe('');
  });
});
