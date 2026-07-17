const { MonitorType } = require("./monitor-type");
const {
    UP,
    PING_PACKET_SIZE_MIN,
    PING_PACKET_SIZE_MAX,
    PING_PACKET_SIZE_DEFAULT,
    PING_GLOBAL_TIMEOUT_MIN,
    PING_GLOBAL_TIMEOUT_MAX,
    PING_GLOBAL_TIMEOUT_DEFAULT,
    PING_COUNT_MIN,
    PING_COUNT_MAX,
    PING_COUNT_DEFAULT,
    PING_PER_REQUEST_TIMEOUT_MIN,
    PING_PER_REQUEST_TIMEOUT_MAX,
    PING_PER_REQUEST_TIMEOUT_DEFAULT,
} = require("../../src/util");
const { ping } = require("../util-server");

class PingMonitorType extends MonitorType {
    name = "ping";

    /**
     * @inheritdoc
     */
    async check(monitor, heartbeat, _server) {
        heartbeat.ping = await ping(
            monitor.hostname,
            monitor.ping_count,
            "",
            monitor.ping_numeric,
            monitor.packetSize,
            monitor.timeout,
            monitor.ping_per_request_timeout
        );
        heartbeat.msg = "";
        heartbeat.status = UP;
    }

    /**
     * @inheritdoc
     */
    validate(monitor) {
        if (
            monitor.packetSize &&
            (monitor.packetSize < PING_PACKET_SIZE_MIN || monitor.packetSize > PING_PACKET_SIZE_MAX)
        ) {
            throw new Error(
                `Packet size must be between ${PING_PACKET_SIZE_MIN} and ${PING_PACKET_SIZE_MAX} (default: ${PING_PACKET_SIZE_DEFAULT})`
            );
        }

        if (
            monitor.ping_per_request_timeout &&
            (monitor.ping_per_request_timeout < PING_PER_REQUEST_TIMEOUT_MIN ||
                monitor.ping_per_request_timeout > PING_PER_REQUEST_TIMEOUT_MAX)
        ) {
            throw new Error(
                `Per-ping timeout must be between ${PING_PER_REQUEST_TIMEOUT_MIN} and ${PING_PER_REQUEST_TIMEOUT_MAX} seconds (default: ${PING_PER_REQUEST_TIMEOUT_DEFAULT})`
            );
        }

        if (monitor.ping_count && (monitor.ping_count < PING_COUNT_MIN || monitor.ping_count > PING_COUNT_MAX)) {
            throw new Error(
                `Echo requests count must be between ${PING_COUNT_MIN} and ${PING_COUNT_MAX} (default: ${PING_COUNT_DEFAULT})`
            );
        }

        if (monitor.timeout) {
            const pingGlobalTimeout = Math.round(Number(monitor.timeout));
            if (
                pingGlobalTimeout < monitor.ping_per_request_timeout ||
                pingGlobalTimeout < PING_GLOBAL_TIMEOUT_MIN ||
                pingGlobalTimeout > PING_GLOBAL_TIMEOUT_MAX
            ) {
                throw new Error(
                    `Timeout must be between ${PING_GLOBAL_TIMEOUT_MIN} and ${PING_GLOBAL_TIMEOUT_MAX} seconds (default: ${PING_GLOBAL_TIMEOUT_DEFAULT})`
                );
            }
            monitor.timeout = pingGlobalTimeout;
        }
    }
}

module.exports = {
    PingMonitorType,
};