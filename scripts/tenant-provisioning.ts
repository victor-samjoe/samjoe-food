import { randomBytes } from 'node:crypto';

export type DocumentType = 'CPF' | 'CNPJ';

export type ProvisioningInput = {
  email: string;
  ownerName: string;
  businessName: string;
  legalName: string;
  storeName: string;
  tenantSlug: string;
  storeSlug: string;
  documentType: DocumentType;
  documentNumber: string;
  birthDate: string | null;
  domain: string | null;
};

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function normalizeDocument(value: string): string {
  return value.replace(/\D/g, '');
}

function hasRepeatedDigits(value: string): boolean {
  return /^(\d)\1+$/.test(value);
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeDocument(value);
  if (cpf.length !== 11 || hasRepeatedDigits(cpf)) return false;
  for (let digit = 9; digit < 11; digit += 1) {
    let total = 0;
    for (let index = 0; index < digit; index += 1) {
      total += Number(cpf[index]) * (digit + 1 - index);
    }
    const remainder = (total * 10) % 11;
    if (Number(cpf[digit]) !== (remainder === 10 ? 0 : remainder)) return false;
  }
  return true;
}

export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeDocument(value);
  if (cnpj.length !== 14 || hasRepeatedDigits(cnpj)) return false;
  const weights = [
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  ];
  for (let check = 0; check < 2; check += 1) {
    const numbers = cnpj.slice(0, 12 + check);
    const sum = [...numbers].reduce((total, number, index) => total + Number(number) * weights[check]![index]!, 0);
    const remainder = sum % 11;
    const expected = remainder < 2 ? 0 : 11 - remainder;
    if (Number(cnpj[12 + check]) !== expected) return false;
  }
  return true;
}

export function normalizeDomain(value: string | undefined): string | null {
  if (!value) return null;
  const hostname = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)) {
    throw new Error('Domínio inválido. Informe somente o hostname, por exemplo loja.exemplo.com.br.');
  }
  return hostname;
}

export function validateBirthDate(value: string | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Data de nascimento deve usar AAAA-MM-DD.');
  const birth = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== value) {
    throw new Error('Data de nascimento inválida.');
  }
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const month = today.getUTCMonth() - birth.getUTCMonth();
  if (month < 0 || (month === 0 && today.getUTCDate() < birth.getUTCDate())) age -= 1;
  if (age < 18) throw new Error('O responsável cadastrado deve ter pelo menos 18 anos.');
  return value;
}

export function createTemporaryPassword(): string {
  return `Sj!${randomBytes(18).toString('base64url')}9a`;
}

export function buildProvisioningInput(values: Record<string, string | undefined>): ProvisioningInput {
  const required = ['email', 'owner-name', 'business-name', 'document'] as const;
  for (const name of required) {
    if (!values[name]?.trim()) throw new Error(`Parâmetro obrigatório ausente: --${name}`);
  }

  const email = values.email!.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.');
  const documentNumber = normalizeDocument(values.document!);
  const documentType: DocumentType = documentNumber.length === 11 ? 'CPF' : 'CNPJ';
  if (documentType === 'CPF' ? !isValidCpf(documentNumber) : !isValidCnpj(documentNumber)) {
    throw new Error('CPF/CNPJ inválido.');
  }

  const businessName = values['business-name']!.trim();
  const tenantSlug = values['tenant-slug']?.trim() || slugify(businessName);
  const storeName = values['store-name']?.trim() || businessName;
  const storeSlug = values['store-slug']?.trim() || tenantSlug;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug)) throw new Error('Slug do tenant inválido.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(storeSlug)) throw new Error('Slug da loja inválido.');

  return {
    email,
    ownerName: values['owner-name']!.trim(),
    businessName,
    legalName: values['legal-name']?.trim() || businessName,
    storeName,
    tenantSlug,
    storeSlug,
    documentType,
    documentNumber,
    birthDate: validateBirthDate(values['birth-date']),
    domain: normalizeDomain(values.domain),
  };
}
