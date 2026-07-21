import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  ApiError,
  AuthError,
  CsrfError,
  NetworkError,
  ThrottledError,
  ValidationError,
} from '../../api/http';
import { getCsrfToken, setCsrfToken } from '../../api/csrfToken';
import { PORTFOLIOS_URL } from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { createPortfolio, listPortfolios } from './api';

const PORTFOLIO = {
  id: 7,
  name: 'Growth',
  base_currency: 'USD',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('listPortfolios', () => {
  it('parses a 200 array response', async () => {
    server.use(http.get(PORTFOLIOS_URL, () => HttpResponse.json([PORTFOLIO])));
    await expect(listPortfolios()).resolves.toEqual([PORTFOLIO]);
  });

  it('parses an empty array', async () => {
    server.use(http.get(PORTFOLIOS_URL, () => HttpResponse.json([])));
    await expect(listPortfolios()).resolves.toEqual([]);
  });

  it('throws AuthError on 401', async () => {
    server.use(http.get(PORTFOLIOS_URL, () => new HttpResponse(null, { status: 401 })));
    await expect(listPortfolios()).rejects.toBeInstanceOf(AuthError);
  });

  it('throws NetworkError on a transport failure', async () => {
    server.use(http.get(PORTFOLIOS_URL, () => HttpResponse.error()));
    await expect(listPortfolios()).rejects.toBeInstanceOf(NetworkError);
  });

  it('throws a generic ApiError on 5xx', async () => {
    server.use(http.get(PORTFOLIOS_URL, () => new HttpResponse(null, { status: 500 })));
    await expect(listPortfolios()).rejects.toMatchObject({ status: 500 });
  });

  it('throws ApiError on a non-JSON 200 body', async () => {
    server.use(
      http.get(PORTFOLIOS_URL, () => new HttpResponse('<html>oops</html>', { status: 200 })),
    );
    await expect(listPortfolios()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('createPortfolio', () => {
  it('parses the created portfolio on 201', async () => {
    server.use(http.post(PORTFOLIOS_URL, () => HttpResponse.json(PORTFOLIO, { status: 201 })));
    await expect(createPortfolio('Growth')).resolves.toEqual(PORTFOLIO);
  });

  it('ensures a CSRF token first and sends it in the header on the POST', async () => {
    expect(getCsrfToken()).toBeNull();
    let sentHeader: string | null = null;
    server.use(
      http.post(PORTFOLIOS_URL, ({ request }) => {
        sentHeader = request.headers.get('X-CSRFToken');
        return HttpResponse.json(PORTFOLIO, { status: 201 });
      }),
    );

    await createPortfolio('Growth');

    // The default csrf handler returns this token; its presence in the header
    // proves ensureCsrfToken ran and primed the holder before the POST.
    expect(getCsrfToken()).toBe('test-csrf-token');
    expect(sentHeader).toBe('test-csrf-token');
  });

  it('reuses an already-held token without refetching', async () => {
    setCsrfToken('already-held');
    let sentHeader: string | null = null;
    server.use(
      http.post(PORTFOLIOS_URL, ({ request }) => {
        sentHeader = request.headers.get('X-CSRFToken');
        return HttpResponse.json(PORTFOLIO, { status: 201 });
      }),
    );

    await createPortfolio('Growth');

    expect(sentHeader).toBe('already-held');
  });

  it('throws a typed ValidationError carrying the field errors on 400', async () => {
    server.use(
      http.post(PORTFOLIOS_URL, () =>
        HttpResponse.json(
          { name: ['You already have a portfolio with this name.'] },
          { status: 400 },
        ),
      ),
    );

    await expect(createPortfolio('Growth')).rejects.toMatchObject({
      fieldErrors: { name: ['You already have a portfolio with this name.'] },
    });
    await expect(createPortfolio('Growth')).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws AuthError on 401', async () => {
    server.use(http.post(PORTFOLIOS_URL, () => new HttpResponse(null, { status: 401 })));
    await expect(createPortfolio('Growth')).rejects.toBeInstanceOf(AuthError);
  });

  it('throws CsrfError on 403', async () => {
    server.use(
      http.post(PORTFOLIOS_URL, () =>
        HttpResponse.json({ detail: 'CSRF verification failed.' }, { status: 403 }),
      ),
    );
    await expect(createPortfolio('Growth')).rejects.toBeInstanceOf(CsrfError);
  });

  it('throws ThrottledError on a defensive 429', async () => {
    server.use(http.post(PORTFOLIOS_URL, () => new HttpResponse(null, { status: 429 })));
    await expect(createPortfolio('Growth')).rejects.toBeInstanceOf(ThrottledError);
  });

  it('throws NetworkError on a transport failure', async () => {
    server.use(http.post(PORTFOLIOS_URL, () => HttpResponse.error()));
    await expect(createPortfolio('Growth')).rejects.toBeInstanceOf(NetworkError);
  });

  it('throws a generic ApiError on 5xx', async () => {
    server.use(http.post(PORTFOLIOS_URL, () => new HttpResponse(null, { status: 500 })));
    await expect(createPortfolio('Growth')).rejects.toMatchObject({ status: 500 });
  });

  it('throws ApiError on a non-JSON 201 body', async () => {
    server.use(http.post(PORTFOLIOS_URL, () => new HttpResponse('not json', { status: 201 })));
    await expect(createPortfolio('Growth')).rejects.toBeInstanceOf(ApiError);
  });
});
