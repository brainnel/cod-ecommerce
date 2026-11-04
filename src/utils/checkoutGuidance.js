export const getCheckoutGuidance = ({ fullNameReady, phoneReady, addressReady }) => {
  if (!fullNameReady) return { field: 'fullName', label: 'Renseigner mon nom' }
  if (!phoneReady) return { field: 'phone', label: 'Renseigner mon téléphone' }
  if (!addressReady) return { field: 'addressDescription', label: 'Compléter mon adresse' }
  return { field: null, label: 'Passer la commande' }
}

export const getDistrictAddressExample = name => {
  const district = typeof name === 'string' ? name.trim() : ''
  return district ? `Ex : ${district}, votre quartier, près de… (nom du repère)` : 'Votre quartier et un repère connu (pharmacie, école…)'
}
