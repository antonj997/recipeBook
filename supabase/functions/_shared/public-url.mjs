import ipaddr from 'ipaddr.js';

// Conservatively exclude special-purpose space even where a registry permits
// isolated global anycast addresses. A recipe origin never needs that space.
const excluded = [
  '192.0.0.0/24',
  '192.88.99.0/24',
  '168.63.129.16/32',
  '2001::/23',
  '2002::/16',
  '3fff::/20',
].map((value) => ipaddr.parseCIDR(value));

export function isPublicAddress(value) {
  try {
    const address = ipaddr.parse(value);
    if (address.zoneId || address.range() !== 'unicast') return false;
    if (address.kind() === 'ipv6' && !address.match(ipaddr.parseCIDR('2000::/3'))) return false;
    return !excluded.some(
      ([network, bits]) => network.kind() === address.kind() && address.match(network, bits),
    );
  } catch {
    return false;
  }
}

export function validatePublicUrl(input) {
  if (
    typeof input !== 'string' ||
    input.length > 2048 ||
    !/^https:\/\//i.test(input) ||
    /[\u0000-\u0020\u007f\\]/.test(input)
  )
    throw new Error('Invalid URL.');
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Invalid URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    throw new Error('Use a standard HTTPS recipe link without a username or password.');
  const hostname = url.hostname.replace(/\.$/, '');
  const labels = hostname.split('.');
  if (
    hostname.length > 253 ||
    labels.length < 2 ||
    labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) ||
    !/[a-z]/i.test(labels.at(-1)) ||
    /\.(?:localhost|local|internal|lan|home|test|invalid|onion|example|arpa)$/i.test(hostname) ||
    ipaddr.isValid(hostname)
  )
    throw new Error('Use a public recipe website. Local addresses are not supported.');
  url.hostname = hostname;
  url.hash = '';
  return url;
}
