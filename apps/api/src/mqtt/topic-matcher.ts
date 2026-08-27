/**
 * MQTT topic-filter matching (`+` = single level, `#` = trailing multi-level).
 * A single broker connection delivers every subscribed topic through one
 * `message` event, so `MqttJsClient` needs this to route each message back
 * to the handler(s) whose filter it matches.
 */
export function matchesTopicFilter(filter: string, topic: string): boolean {
  const filterParts = filter.split("/");
  const topicParts = topic.split("/");

  for (let i = 0; i < filterParts.length; i++) {
    const filterPart = filterParts[i];

    if (filterPart === "#") {
      return true;
    }

    if (i >= topicParts.length) {
      return false;
    }

    if (filterPart !== "+" && filterPart !== topicParts[i]) {
      return false;
    }
  }

  return filterParts.length === topicParts.length;
}
