export default function ContractDetailPage({
  params,
}: {
  params: { contractId: string }
}) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900">Detalle del Contrato</h1>
      <p className="text-gray-500 mt-2">ID: {params.contractId}</p>
    </div>
  )
}
