import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function TabsWrapper() {
  const [activeTab, setActiveTab] = useState("events");

  useEffect(() => {
    // handle tab content visibility
    const showTabContent = (tabName: string) => {
      // hide all tab contents
      const allTabContents = document.querySelectorAll(".tab-content");
      allTabContents.forEach((content) => {
        content.classList.add("hidden");
      });

      // show the selected tab content
      const targetContent = document.getElementById(`${tabName}-content`);
      if (targetContent) {
        targetContent.classList.remove("hidden");
      }
    };

    // show initial tab
    showTabContent(activeTab);

    // add event listener for tab changes
    const handleTabChange = () => {
      showTabContent(activeTab);
    };

    handleTabChange();
  }, [activeTab]);

  return (
    <div className="w-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 grid w-full grid-cols-3">
          <TabsTrigger value="events" className="text-sm sm:text-base">
            Calendar
          </TabsTrigger>
          <TabsTrigger value="artists" className="text-sm sm:text-base">
            Artists
          </TabsTrigger>
          <TabsTrigger value="venues" className="text-sm sm:text-base">
            Venues
          </TabsTrigger>
        </TabsList>

        {/* the actual content is rendered by astro below this component */}
      </Tabs>
    </div>
  );
}
