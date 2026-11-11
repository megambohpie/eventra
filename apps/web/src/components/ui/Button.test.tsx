import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from './Button';

describe('Button', () => {
  it('menampilkan spinner dan nonaktif saat loading', () => {
    const html = renderToStaticMarkup(<Button loading>Save</Button>);
    expect(html).toContain('loading loading-spinner');
    expect(html).toContain('disabled');
    expect(html).toContain('aria-busy="true"');
  });

  it('normal: tanpa spinner dan memakai kelas DaisyUI', () => {
    const html = renderToStaticMarkup(<Button variant="error">Delete</Button>);
    expect(html).not.toContain('loading-spinner');
    expect(html).toContain('btn btn-error');
    expect(html).toContain('type="button"');
  });
});
