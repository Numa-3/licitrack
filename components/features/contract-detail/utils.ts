type ItemForWhatsApp = {
  type: 'purchase' | 'logistics' | 'service'
  short_name: string
  quantity: number
  unit: string | null
}

type ContractForWhatsApp = {
  name: string
  organizations: { name: string } | null
}

export function marginPct(sale: number | null, cost: number | null): number | null {
  if (!sale || !cost || sale === 0) return null
  return ((sale - cost) / sale) * 100
}

export function marginColor(pct: number | null): string {
  if (pct == null) return 'text-gray-400'
  if (pct < 0) return 'text-red-600 font-semibold'
  if (pct < 15) return 'text-orange-500 font-medium'
  return 'text-green-600'
}

export function buildWhatsAppUrl(phone: string | null, item: ItemForWhatsApp, contract: ContractForWhatsApp): string | null {
  if (!phone) return null
  const clean = phone.replace(/\D/g, '')
  if (clean.length < 7) return null

  const orgName = contract.organizations?.name || 'nuestra empresa'
  let msg = ''
  if (item.type === 'purchase') {
    msg = `Hola, te escribo de ${orgName} sobre el contrato "${contract.name}". Necesitamos cotización para: ${item.short_name} (${item.quantity} ${item.unit || 'und'}). ¿Nos puedes ayudar?`
  } else if (item.type === 'logistics') {
    msg = `Hola, te escribo de ${orgName} sobre "${contract.name}". Necesitamos coordinar: ${item.short_name}. ¿Podemos hablar?`
  } else {
    msg = `Hola, te escribo de ${orgName} sobre "${contract.name}". Necesitamos el servicio: ${item.short_name}. ¿Están disponibles?`
  }
  return `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`
}
