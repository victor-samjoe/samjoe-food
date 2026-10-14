type Context = { params: Promise<{ postalCode: string }> };

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

export async function GET(_request: Request, context: Context) {
  const { postalCode: rawPostalCode } = await context.params;
  const postalCode = rawPostalCode.replace(/\D/g, '');

  if (!/^\d{8}$/.test(postalCode)) {
    return Response.json(
      { error: { code: 'invalid_postal_code', message: 'Informe um CEP com 8 dígitos.' } },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`ViaCEP respondeu com status ${response.status}`);

    const address = await response.json() as ViaCepResponse;
    if (address.erro || !address.localidade || !address.uf) {
      return Response.json(
        { error: { code: 'postal_code_not_found', message: 'CEP não encontrado.' } },
        { status: 404 },
      );
    }

    return Response.json({
      postal_code: postalCode,
      street: address.logradouro?.trim() ?? '',
      district: address.bairro?.trim() ?? '',
      city: address.localidade.trim(),
      state: address.uf.trim().toUpperCase(),
      complement_hint: address.complemento?.trim() ?? '',
    });
  } catch {
    return Response.json(
      { error: { code: 'postal_code_service_unavailable', message: 'Não foi possível consultar o CEP agora.' } },
      { status: 502 },
    );
  }
}
