import { FaWhatsapp } from 'react-icons/fa'

const WhatsAppCommunity = ({ group, onJoin }) => {
  if (!group) return null
  return (
    <section className="os-community" aria-labelledby="os-community-title">
      <h2 id="os-community-title">Le groupe clients Brainnel</h2>
      <p>Nouveautés et offres clients, sur WhatsApp.</p>
      <a className="os-join-group" href={group.url} onClick={onJoin} aria-label="Rejoindre le groupe WhatsApp Brainnel">
        <FaWhatsapp aria-hidden="true" /><span>Rejoindre le groupe</span>
      </a>
    </section>
  )
}

export default WhatsAppCommunity
