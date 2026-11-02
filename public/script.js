 
(function () {
  const $ = id => document.getElementById(id);

  // Same-origin API works locally and after deployment.
  const API = "/api";

  let currentSuggestion = null;

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function showMessage(message, isError = false) {
    const box = $("sugg");

    if (!box) return;

    box.hidden = false;
    box.textContent = message;
    box.style.borderLeftColor = isError
      ? "var(--bad)"
      : "var(--yellow)";
  }

  async function apiRequest(endpoint, options = {}) {
    const response = await fetch(API + endpoint, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    return data;
  }

  const form = $("f");

  if (!form) {
    console.error("Customer booking form not found.");
    return;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const details = {
      cargo: $("cargo").value,
      weight: Number($("wt").value),
      urgency: $("urg").value,
      from: $("from").value.trim(),
      to: $("to").value.trim(),
      preferredMode: $("mode").value
    };

    if (
      !details.from ||
      !details.to ||
      details.from.toLowerCase() === details.to.toLowerCase()
    ) {
      showMessage(
        "Pickup and drop must be different locations.",
        true
      );
      return;
    }

    const button = form.querySelector('button[type="submit"]');

    if (!button) return;

    button.disabled = true;

    try {
      currentSuggestion = await apiRequest("/suggest", {
        method: "POST",
        body: JSON.stringify(details)
      });

      if (!currentSuggestion.available) {
        showMessage(
          "No vehicle is currently available for this suggestion.",
          true
        );
        currentSuggestion = null;
        return;
      }

      const s = $("sugg");

      if (!s) return;

      s.hidden = false;
      s.style.borderLeftColor = "var(--yellow)";

      s.innerHTML = `
        <b>Suggested: ${
          currentSuggestion.mode === "road" ? "Road" : "Water"
        }</b>
        <br>Estimated time: ${escapeHTML(currentSuggestion.days)} days
        <br>Suggested vehicle: ${escapeHTML(currentSuggestion.vehicle)}
        <br>${escapeHTML(currentSuggestion.reason)}
        <div class="row" style="margin-top:10px">
          <button class="btn sm" id="send" type="button">
            Send to staff for review
          </button>
        </div>
      `;

      const sendButton = $("send");

      sendButton.addEventListener("click", async function () {
        this.disabled = true;

        try {
          const booking = await apiRequest("/bookings", {
            method: "POST",
            body: JSON.stringify(details)
          });

          showMessage(
            `Booking ${escapeHTML(booking.id)} sent to staff for review.`
          );

          currentSuggestion = null;
        } catch (error) {
          showMessage(error.message, true);
          this.disabled = false;
        }
      });

    } catch (error) {
      showMessage(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

})();
