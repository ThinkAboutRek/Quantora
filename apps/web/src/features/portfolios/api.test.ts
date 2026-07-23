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
import {
  PORTFOLIOS_URL,
  portfolioArchiveUrl,
  portfolioDetailUrl,
  portfolioUnarchiveUrl,
} from '../../mocks/handlers';
import { server } from '../../mocks/server';
import {
  archivePortfolio,
  createPortfolio,
  deletePortfolio,
  getPortfolio,
  listPortfolios,
  renamePortfolio,
  unarchivePortfolio,
} from './api';
import { isLifecycleError, isNotFoundError } from './types';

const PORTFOLIO = {
  id: 7,
  name: 'Growth',
  base_currency: 'USD',
  is_archived: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const ARCHIVED = { ...PORTFOLIO, is_archived: true };

const DETAIL_URL = portfolioDetailUrl(PORTFOLIO.id);
const ARCHIVE_URL = portfolioArchiveUrl(PORTFOLIO.id);
const UNARCHIVE_URL = portfolioUnarchiveUrl(PORTFOLIO.id);

const LIFECYCLE_400 = { detail: 'Unarchive the portfolio before renaming it.' };
const FIELD_400 = { name: ['You already have a portfolio with this name.'] };

describe('listPortfolios', () => {
  it('parses a 200 array response', async () => {
    server.use(http.get(PORTFOLIOS_URL, () => HttpResponse.json([PORTFOLIO])));
    await expect(listPortfolios()).resolves.toEqual([PORTFOLIO]);
  });

  it('parses an empty array', async () => {
    server.use(http.get(PORTFOLIOS_URL, () => HttpResponse.json([])));
    await expect(listPortfolios()).resolves.toEqual([]);
  });

  it('sends no filter on the plain call', async () => {
    let query: string | null = null;
    server.use(
      http.get(PORTFOLIOS_URL, ({ request }) => {
        query = new URL(request.url).searchParams.get('archived');
        return HttpResponse.json([]);
      }),
    );

    await listPortfolios();

    expect(query).toBeNull();
  });

  it('sends ?archived=true for the archived selection', async () => {
    let query: string | null = null;
    server.use(
      http.get(PORTFOLIOS_URL, ({ request }) => {
        query = new URL(request.url).searchParams.get('archived');
        return HttpResponse.json([ARCHIVED]);
      }),
    );

    await expect(listPortfolios('archived')).resolves.toEqual([ARCHIVED]);

    expect(query).toBe('true');
  });

  it('sends ?archived=false for the explicit active selection', async () => {
    let query: string | null = null;
    server.use(
      http.get(PORTFOLIOS_URL, ({ request }) => {
        query = new URL(request.url).searchParams.get('archived');
        return HttpResponse.json([]);
      }),
    );

    await listPortfolios('active');

    expect(query).toBe('false');
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

describe('getPortfolio', () => {
  it('parses the portfolio on 200', async () => {
    server.use(http.get(DETAIL_URL, () => HttpResponse.json(PORTFOLIO)));
    await expect(getPortfolio(PORTFOLIO.id)).resolves.toEqual(PORTFOLIO);
  });

  it('parses an archived portfolio on 200', async () => {
    server.use(http.get(DETAIL_URL, () => HttpResponse.json(ARCHIVED)));
    await expect(getPortfolio(PORTFOLIO.id)).resolves.toMatchObject({ is_archived: true });
  });

  it('throws the concealed 404 as an ApiError recognised by isNotFoundError', async () => {
    server.use(
      http.get(DETAIL_URL, () => HttpResponse.json({ detail: 'Not found.' }, { status: 404 })),
    );

    const error = await getPortfolio(PORTFOLIO.id).catch((thrown: unknown) => thrown);

    expect(isNotFoundError(error)).toBe(true);
  });

  it('throws AuthError on 401', async () => {
    server.use(http.get(DETAIL_URL, () => new HttpResponse(null, { status: 401 })));
    await expect(getPortfolio(PORTFOLIO.id)).rejects.toBeInstanceOf(AuthError);
  });

  it('throws NetworkError on a transport failure', async () => {
    server.use(http.get(DETAIL_URL, () => HttpResponse.error()));
    await expect(getPortfolio(PORTFOLIO.id)).rejects.toBeInstanceOf(NetworkError);
  });

  it('throws a generic ApiError on 5xx', async () => {
    server.use(http.get(DETAIL_URL, () => new HttpResponse(null, { status: 500 })));
    await expect(getPortfolio(PORTFOLIO.id)).rejects.toMatchObject({ status: 500 });
  });

  it('throws ApiError on a non-JSON 200 body', async () => {
    server.use(http.get(DETAIL_URL, () => new HttpResponse('not json', { status: 200 })));
    await expect(getPortfolio(PORTFOLIO.id)).rejects.toBeInstanceOf(ApiError);
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
    server.use(http.post(PORTFOLIOS_URL, () => HttpResponse.json(FIELD_400, { status: 400 })));

    await expect(createPortfolio('Growth')).rejects.toMatchObject({
      fieldErrors: FIELD_400,
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

describe('renamePortfolio', () => {
  it('parses the authoritative renamed portfolio on 200', async () => {
    server.use(http.patch(DETAIL_URL, () => HttpResponse.json({ ...PORTFOLIO, name: 'Renamed' })));
    await expect(renamePortfolio(PORTFOLIO.id, 'Renamed')).resolves.toMatchObject({
      name: 'Renamed',
    });
  });

  it('ensures a CSRF token before the PATCH', async () => {
    expect(getCsrfToken()).toBeNull();
    let sentHeader: string | null = null;
    server.use(
      http.patch(DETAIL_URL, ({ request }) => {
        sentHeader = request.headers.get('X-CSRFToken');
        return HttpResponse.json(PORTFOLIO);
      }),
    );

    await renamePortfolio(PORTFOLIO.id, 'Growth');

    expect(sentHeader).toBe('test-csrf-token');
  });

  it('distinguishes a field 400 from a lifecycle 400', async () => {
    server.use(http.patch(DETAIL_URL, () => HttpResponse.json(FIELD_400, { status: 400 })));

    const fieldError = await renamePortfolio(PORTFOLIO.id, 'Dup').catch(
      (thrown: unknown) => thrown,
    );

    expect(fieldError).toBeInstanceOf(ValidationError);
    expect(isLifecycleError(fieldError as ValidationError)).toBe(false);
    expect((fieldError as ValidationError).fieldErrors.name).toEqual(FIELD_400.name);
  });

  it('surfaces a lifecycle 400 as a non-field detail', async () => {
    server.use(http.patch(DETAIL_URL, () => HttpResponse.json(LIFECYCLE_400, { status: 400 })));

    const lifecycleError = await renamePortfolio(PORTFOLIO.id, 'Revived').catch(
      (thrown: unknown) => thrown,
    );

    expect(lifecycleError).toBeInstanceOf(ValidationError);
    expect(isLifecycleError(lifecycleError as ValidationError)).toBe(true);
    expect((lifecycleError as ValidationError).detail).toBe(LIFECYCLE_400.detail);
  });

  it('throws the concealed 404', async () => {
    server.use(
      http.patch(DETAIL_URL, () => HttpResponse.json({ detail: 'Not found.' }, { status: 404 })),
    );

    const error = await renamePortfolio(PORTFOLIO.id, 'Renamed').catch((thrown: unknown) => thrown);

    expect(isNotFoundError(error)).toBe(true);
  });

  it('throws AuthError on 401 and CsrfError on 403', async () => {
    server.use(http.patch(DETAIL_URL, () => new HttpResponse(null, { status: 401 })));
    await expect(renamePortfolio(PORTFOLIO.id, 'Renamed')).rejects.toBeInstanceOf(AuthError);

    server.use(http.patch(DETAIL_URL, () => new HttpResponse(null, { status: 403 })));
    await expect(renamePortfolio(PORTFOLIO.id, 'Renamed')).rejects.toBeInstanceOf(CsrfError);
  });

  it('throws ThrottledError on 429 and NetworkError on transport failure', async () => {
    server.use(http.patch(DETAIL_URL, () => new HttpResponse(null, { status: 429 })));
    await expect(renamePortfolio(PORTFOLIO.id, 'Renamed')).rejects.toBeInstanceOf(ThrottledError);

    server.use(http.patch(DETAIL_URL, () => HttpResponse.error()));
    await expect(renamePortfolio(PORTFOLIO.id, 'Renamed')).rejects.toBeInstanceOf(NetworkError);
  });

  it('throws a generic ApiError on 5xx and on a non-JSON 200 body', async () => {
    server.use(http.patch(DETAIL_URL, () => new HttpResponse(null, { status: 500 })));
    await expect(renamePortfolio(PORTFOLIO.id, 'Renamed')).rejects.toMatchObject({ status: 500 });

    server.use(http.patch(DETAIL_URL, () => new HttpResponse('not json', { status: 200 })));
    await expect(renamePortfolio(PORTFOLIO.id, 'Renamed')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('archivePortfolio', () => {
  it('parses the authoritative archived record on 200', async () => {
    server.use(http.post(ARCHIVE_URL, () => HttpResponse.json(ARCHIVED)));
    await expect(archivePortfolio(PORTFOLIO.id)).resolves.toMatchObject({ is_archived: true });
  });

  it('ensures a CSRF token before the POST', async () => {
    expect(getCsrfToken()).toBeNull();
    let sentHeader: string | null = null;
    server.use(
      http.post(ARCHIVE_URL, ({ request }) => {
        sentHeader = request.headers.get('X-CSRFToken');
        return HttpResponse.json(ARCHIVED);
      }),
    );

    await archivePortfolio(PORTFOLIO.id);

    expect(sentHeader).toBe('test-csrf-token');
  });

  it('throws the concealed 404', async () => {
    server.use(http.post(ARCHIVE_URL, () => new HttpResponse(null, { status: 404 })));

    const error = await archivePortfolio(PORTFOLIO.id).catch((thrown: unknown) => thrown);

    expect(isNotFoundError(error)).toBe(true);
  });

  it('throws AuthError on 401 and CsrfError on 403', async () => {
    server.use(http.post(ARCHIVE_URL, () => new HttpResponse(null, { status: 401 })));
    await expect(archivePortfolio(PORTFOLIO.id)).rejects.toBeInstanceOf(AuthError);

    server.use(http.post(ARCHIVE_URL, () => new HttpResponse(null, { status: 403 })));
    await expect(archivePortfolio(PORTFOLIO.id)).rejects.toBeInstanceOf(CsrfError);
  });

  it('throws ThrottledError on 429 and NetworkError on transport failure', async () => {
    server.use(http.post(ARCHIVE_URL, () => new HttpResponse(null, { status: 429 })));
    await expect(archivePortfolio(PORTFOLIO.id)).rejects.toBeInstanceOf(ThrottledError);

    server.use(http.post(ARCHIVE_URL, () => HttpResponse.error()));
    await expect(archivePortfolio(PORTFOLIO.id)).rejects.toBeInstanceOf(NetworkError);
  });

  it('throws a generic ApiError on 5xx and on a non-JSON 200 body', async () => {
    server.use(http.post(ARCHIVE_URL, () => new HttpResponse(null, { status: 500 })));
    await expect(archivePortfolio(PORTFOLIO.id)).rejects.toMatchObject({ status: 500 });

    server.use(http.post(ARCHIVE_URL, () => new HttpResponse('not json', { status: 200 })));
    await expect(archivePortfolio(PORTFOLIO.id)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('unarchivePortfolio', () => {
  it('parses the authoritative restored record on 200', async () => {
    server.use(http.post(UNARCHIVE_URL, () => HttpResponse.json(PORTFOLIO)));
    await expect(unarchivePortfolio(PORTFOLIO.id)).resolves.toMatchObject({ is_archived: false });
  });

  it('ensures a CSRF token before the POST', async () => {
    expect(getCsrfToken()).toBeNull();
    let sentHeader: string | null = null;
    server.use(
      http.post(UNARCHIVE_URL, ({ request }) => {
        sentHeader = request.headers.get('X-CSRFToken');
        return HttpResponse.json(PORTFOLIO);
      }),
    );

    await unarchivePortfolio(PORTFOLIO.id);

    expect(sentHeader).toBe('test-csrf-token');
  });

  it('throws the concealed 404', async () => {
    server.use(http.post(UNARCHIVE_URL, () => new HttpResponse(null, { status: 404 })));

    const error = await unarchivePortfolio(PORTFOLIO.id).catch((thrown: unknown) => thrown);

    expect(isNotFoundError(error)).toBe(true);
  });

  it('throws AuthError on 401 and CsrfError on 403', async () => {
    server.use(http.post(UNARCHIVE_URL, () => new HttpResponse(null, { status: 401 })));
    await expect(unarchivePortfolio(PORTFOLIO.id)).rejects.toBeInstanceOf(AuthError);

    server.use(http.post(UNARCHIVE_URL, () => new HttpResponse(null, { status: 403 })));
    await expect(unarchivePortfolio(PORTFOLIO.id)).rejects.toBeInstanceOf(CsrfError);
  });
});

describe('deletePortfolio', () => {
  it('resolves on the empty 204', async () => {
    server.use(http.delete(DETAIL_URL, () => new HttpResponse(null, { status: 204 })));
    await expect(deletePortfolio(PORTFOLIO.id)).resolves.toBeUndefined();
  });

  it('ensures a CSRF token before the DELETE', async () => {
    expect(getCsrfToken()).toBeNull();
    let sentHeader: string | null = null;
    server.use(
      http.delete(DETAIL_URL, ({ request }) => {
        sentHeader = request.headers.get('X-CSRFToken');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await deletePortfolio(PORTFOLIO.id);

    expect(sentHeader).toBe('test-csrf-token');
  });

  it('surfaces the lifecycle 400 for an active portfolio', async () => {
    server.use(
      http.delete(DETAIL_URL, () =>
        HttpResponse.json({ detail: 'Archive the portfolio before deleting it.' }, { status: 400 }),
      ),
    );

    const error = await deletePortfolio(PORTFOLIO.id).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ValidationError);
    expect(isLifecycleError(error as ValidationError)).toBe(true);
  });

  it('throws the concealed 404', async () => {
    server.use(
      http.delete(DETAIL_URL, () => HttpResponse.json({ detail: 'Not found.' }, { status: 404 })),
    );

    const error = await deletePortfolio(PORTFOLIO.id).catch((thrown: unknown) => thrown);

    expect(isNotFoundError(error)).toBe(true);
  });

  it('throws AuthError on 401 and CsrfError on 403', async () => {
    server.use(http.delete(DETAIL_URL, () => new HttpResponse(null, { status: 401 })));
    await expect(deletePortfolio(PORTFOLIO.id)).rejects.toBeInstanceOf(AuthError);

    server.use(http.delete(DETAIL_URL, () => new HttpResponse(null, { status: 403 })));
    await expect(deletePortfolio(PORTFOLIO.id)).rejects.toBeInstanceOf(CsrfError);
  });

  it('throws ThrottledError on 429 and NetworkError on transport failure', async () => {
    server.use(http.delete(DETAIL_URL, () => new HttpResponse(null, { status: 429 })));
    await expect(deletePortfolio(PORTFOLIO.id)).rejects.toBeInstanceOf(ThrottledError);

    server.use(http.delete(DETAIL_URL, () => HttpResponse.error()));
    await expect(deletePortfolio(PORTFOLIO.id)).rejects.toBeInstanceOf(NetworkError);
  });

  it('throws a generic ApiError on 5xx', async () => {
    server.use(http.delete(DETAIL_URL, () => new HttpResponse(null, { status: 500 })));
    await expect(deletePortfolio(PORTFOLIO.id)).rejects.toMatchObject({ status: 500 });
  });
});
