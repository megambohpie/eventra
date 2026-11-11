// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import '../i18n';
import { FOOTER_TEXT, Layout } from './Layout';

describe('Layout', () => {
  it('menampilkan footer wajib dengan komponen DaisyUI', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );
    expect(html).toContain(FOOTER_TEXT);
    expect(html).toContain('class="footer');
    expect(html).toContain('navbar');
  });
});
